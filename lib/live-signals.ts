// Single source of truth for "what's actually live right now" — the exact
// same signal set the ticker/marquee shows (status = 'active' only, one row
// per symbol, latest edit wins), with live Fyers quotes merged in.
//
// Both /api/signals (the ticker) and the track record page call
// loadLiveSignals() — neither queries `signals` independently — so the two
// can never drift apart. Suppressed/manual_override/closed signals are
// excluded at the query level here, not filtered after the fact by a caller
// that might get it wrong.
//
// Deliberately does NOT read from the `positions` ledger table — that's a
// separate manual/auto-populated bookkeeping table that can lag or contain
// entries for signals that are no longer active. "Live signals matter,
// nothing else."

import { getPool } from "./db";
import { getQuotes, type Quote } from "./fyers";
import { announceOutcome } from "./telegram-results";

/**
 * Live, price-derived outcome. This is what powers the DIR badge flipping
 * from "BUY" to "TARGET HIT"/"STOPPED" automatically once price crosses one
 * of those levels, instead of a signal sitting there looking like an open
 * BUY forever until an admin manually suppresses it.
 *
 * Once price crosses the stop or a target, that outcome is STICKY — see
 * loadLiveSignals() below, which persists it to signals.outcome_locked the
 * first time it happens and prefers the locked value over live price on
 * every call after that. A "stopped" signal must never quietly go back to
 * looking like an open BUY just because price bounced back above the stop —
 * that flip-flopping is exactly what confused things before. Only an admin
 * editing the signal (PATCH /api/signals/[id]) clears the lock.
 */
export type SignalOutcome = "open" | "target_hit" | "stopped";

/**
 * The FURTHEST configured target hit (T3 if set, else T2, else T1) →
 * "target_hit" — a trade with a T1/T2/T3 ladder is still genuinely running
 * after only T1 prints; closing it there would hide that T2/T3 are still in
 * play. Hitting an earlier target along the way still lights up that
 * target's own checkmark (see targetReached() on the track record page) —
 * this only gates the overall open/closed status, not the per-target marks.
 * Stop crossed (unfavorable direction) → "stopped", regardless of how many
 * targets were hit first — once the trade is stopped out it's done, full
 * stop, no partial-target exception.
 * Neither, or a "watch" signal with no direction to judge against → "open".
 * If both a target and the stop are technically crossed (shouldn't happen
 * for a sane setup, but live prices are messy), stop takes precedence —
 * "the trade got stopped out" is the more urgent fact to surface.
 */
export function computeOutcome(
  signalType: "buy" | "sell" | "watch",
  price: number,
  targets: (number | null)[],
  stop: number | null
): SignalOutcome {
  if (signalType === "watch") return "open";
  // A price of 0 (or negative) is never real — it means no live quote was
  // available and the signal also has no stored fallback price (manually
  // created signals never had a price column set). Treating 0 as a real
  // price made every BUY read as "stopped" (0 <= any positive stop) and
  // every SELL read as "target_hit" (0 <= any positive target) whenever
  // Fyers quotes were briefly unavailable — the whole ticker's DIR badges
  // would flip incorrectly. Bail to "open" instead of guessing.
  if (!(price > 0)) return "open";
  const set = targets.filter((t): t is number => t !== null && t > 0);
  if (signalType === "buy") {
    if (stop && stop > 0 && price <= stop) return "stopped";
    // Furthest target = highest price for a buy (T3 > T2 > T1 by design).
    if (set.length > 0 && price >= Math.max(...set)) return "target_hit";
  } else {
    if (stop && stop > 0 && price >= stop) return "stopped";
    // Furthest target = lowest price for a sell.
    if (set.length > 0 && price <= Math.min(...set)) return "target_hit";
  }
  return "open";
}

export type LiveSignal = {
  symbol: string;
  name: string;
  signal: "buy" | "sell" | "watch";
  price: number;
  changePct: number;
  change: number;
  entry: number | null;
  /** T1 / short-term target. */
  target: number | null;
  /** T2 / medium-term target — not every signal has one yet. */
  target2: number | null;
  /** T3 / long-term target — not every signal has one yet. */
  target3: number | null;
  stop: number | null;
  /** Live-derived — see computeOutcome(). Not stored, always fresh. */
  outcome: SignalOutcome;
  /** Price frozen at the exact moment outcome was locked (stopped/target_hit)
   *  — see outcome_exit_price in the sticky-lock migration. null while the
   *  trade is still open, or if this environment predates that migration
   *  (exitPriceSupported tier). Callers should prefer this over `price` once
   *  a trade has closed — `price` keeps drifting with the live quote, which
   *  is exactly the wrong number for a return % or "what did it actually
   *  exit at" display once the trade is over. */
  exitPrice: number | null;
  daysIn: number;
  daysToExit: number;
  /** When this symbol's active signal was first generated (ISO). */
  generatedAt: string;
};

// Shared across every caller within a server instance's lifetime (every
// signed-in user's ticker polls every 10s, plus the track record page) —
// cache briefly so we're not hammering Fyers once per request. Keyed by the
// sorted symbol set so it self-invalidates when the active signal list
// changes.
type QuoteCacheEntry = { at: number; data: Map<string, Quote> };
let quoteCache: QuoteCacheEntry | null = null;
let quoteCacheKey = "";
const QUOTE_TTL_MS = 20_000;

async function getQuotesCached(symbols: string[]): Promise<Map<string, Quote>> {
  if (symbols.length === 0) return new Map();
  const key = [...symbols].sort().join(",");
  if (quoteCache && quoteCacheKey === key && Date.now() - quoteCache.at < QUOTE_TTL_MS) {
    return quoteCache.data;
  }
  const data = await getQuotes(symbols);
  quoteCache = { at: Date.now(), data };
  quoteCacheKey = key;
  return data;
}

const BASE_COLUMNS =
  "id, symbol, name, signal_type, price, entry_price, target_price, target_price_2, target_price_3, " +
  "stop_price, days_in, days_to_exit, status, generated_at, updated_at";

async function queryActiveSignals(pool: ReturnType<typeof getPool>) {
  // Three tiers, each degrading gracefully rather than taking the whole
  // ticker down:
  //  1. Full — outcome_locked/outcome_locked_at (migration_signal_outcome_lock.sql)
  //     AND outcome_exit_price (migration_telegram_digest.sql) both applied.
  //  2. Lock only — outcome_locked/outcome_locked_at applied, but the newer
  //     outcome_exit_price migration hasn't run yet on this environment.
  //     Sticky lock still works; the exit price just won't be frozen for the
  //     digest feature until the migration runs.
  //  3. Neither — sticky lock disabled entirely, outcome computed live only.
  try {
    const { rows } = await pool.query(
      `SELECT * FROM (
         SELECT DISTINCT ON (symbol)
                ${BASE_COLUMNS}, outcome_locked, outcome_locked_at, outcome_exit_price
           FROM signals
          WHERE status = 'active'
          ORDER BY symbol, updated_at DESC
       ) t
       ORDER BY generated_at DESC, symbol`
    );
    return { rows, lockSupported: true, exitPriceSupported: true };
  } catch {
    // fall through to tier 2
  }
  try {
    const { rows } = await pool.query(
      `SELECT * FROM (
         SELECT DISTINCT ON (symbol)
                ${BASE_COLUMNS}, outcome_locked, outcome_locked_at
           FROM signals
          WHERE status = 'active'
          ORDER BY symbol, updated_at DESC
       ) t
       ORDER BY generated_at DESC, symbol`
    );
    return { rows, lockSupported: true, exitPriceSupported: false };
  } catch (error) {
    console.error(
      "loadLiveSignals: outcome_locked columns missing — run scripts/migration_signal_outcome_lock.sql; sticky lock disabled for now",
      error
    );
    const { rows } = await pool.query(
      `SELECT * FROM (
         SELECT DISTINCT ON (symbol)
                ${BASE_COLUMNS}
           FROM signals
          WHERE status = 'active'
          ORDER BY symbol, updated_at DESC
       ) t
       ORDER BY generated_at DESC, symbol`
    );
    return { rows, lockSupported: false, exitPriceSupported: false };
  }
}

export async function loadLiveSignals(): Promise<{ signals: LiveSignal[]; quotesOk: boolean }> {
  const pool = getPool();
  const { rows, lockSupported, exitPriceSupported } = await queryActiveSignals(pool);

  let quotes = new Map<string, Quote>();
  let quotesOk = true;
  try {
    quotes = await getQuotesCached(rows.map((r) => r.symbol as string));
  } catch (error) {
    console.error("loadLiveSignals: live quotes unavailable, falling back to stored price", error);
    quotesOk = false;
  }

  const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));

  // Signals that just crossed a target or the stop for the first time this
  // call — persisted below so the outcome never reverts on its own once set,
  // and (once actually persisted — see RETURNING id below) broadcast to the
  // public results channel via announceOutcome().
  const newlyLocked: {
    id: string;
    outcome: "target_hit" | "stopped";
    symbol: string;
    signal: "buy" | "sell" | "watch";
    entry: number | null;
    exitPrice: number;
    daysIn: number;
  }[] = [];

  const signals: LiveSignal[] = rows.map((r) => {
    const quote = quotes.get(r.symbol as string);
    const price = quote ? quote.ltp : Number(r.price) || 0;
    const changePct = quote && quote.prevClose ? ((quote.ltp - quote.prevClose) / quote.prevClose) * 100 : 0;
    const change = quote ? quote.ltp - quote.prevClose : 0;
    const signalType = r.signal_type as "buy" | "sell" | "watch";
    const target = numOrNull(r.target_price);
    const target2 = numOrNull(r.target_price_2);
    const target3 = numOrNull(r.target_price_3);
    const stop = numOrNull(r.stop_price);

    const locked = r.outcome_locked as "target_hit" | "stopped" | null | undefined;
    let outcome: SignalOutcome;
    // Price frozen at the moment the trade actually closed — see the
    // `exitPrice` field doc comment on LiveSignal. null while still open.
    let exitPrice: number | null = null;
    if (locked === "stopped" || locked === "target_hit") {
      // Already locked from a previous call — stays put regardless of what
      // the current live price says, until an admin edits the signal.
      outcome = locked;
      // BUG FIX (verified against real Fyers OHLC — MCX crossed its ₹3,328
      // target on 2026-08-26, a genuine ~10.4% move, but was showing +5.7%
      // because this fallback used to be `?? price`): rows locked before
      // outcome_exit_price existed (migration_telegram_digest.sql), or any
      // other row that somehow still has it NULL, were falling back to
      // *today's live price* — so a "closed" trade's return kept drifting
      // with the market every single day instead of staying frozen at the
      // level that actually closed it. The stop/target price that defined
      // the close is the correct fallback, not a live quote taken well after
      // the fact. See scripts/migration_backfill_outcome_exit_price.sql for
      // the one-time DB backfill; this stays as a defensive fallback only.
      exitPrice = numOrNull(r.outcome_exit_price) ?? (locked === "stopped" ? stop : target) ?? price;
    } else {
      const live = computeOutcome(signalType, price, [target, target2, target3], stop);
      outcome = live;
      if (live === "stopped" || live === "target_hit") {
        exitPrice = price; // freezing right now, in this exact call
        if (lockSupported) {
          newlyLocked.push({
            id: r.id as string,
            outcome: live,
            symbol: r.symbol as string,
            signal: signalType,
            entry: numOrNull(r.entry_price),
            exitPrice: price,
            daysIn: Number(r.days_in) || 0,
          });
        }
      }
    }

    return {
      symbol: r.symbol as string,
      name: (r.name ?? r.symbol) as string,
      signal: signalType,
      price,
      changePct,
      change,
      entry: numOrNull(r.entry_price),
      target,
      target2,
      target3,
      stop,
      outcome,
      exitPrice,
      daysIn: Number(r.days_in) || 0,
      daysToExit: Number(r.days_to_exit) || 0,
      generatedAt: new Date(r.generated_at as string).toISOString(),
    };
  });

  if (newlyLocked.length > 0) {
    // Actually-locked-by-this-call ids only — RETURNING id, not the input
    // list, because two concurrent loadLiveSignals() calls (e.g. two users'
    // tickers polling at once) can both compute the same newlyLocked
    // candidate; the `outcome_locked IS NULL` guard means only one of them
    // actually flips the row. Broadcasting off the input list instead of
    // RETURNING would announce the same close twice.
    //
    // Per-row updates (not a bulk WHERE id = ANY(...)) because each signal's
    // exitPrice differs — outcome_exit_price freezes the price at the exact
    // moment of crossing, so the Telegram digest's return% doesn't keep
    // drifting with the live quote after the trade is actually over. Volume
    // here is always tiny (how many signals cross in the same ~10s poll?),
    // so per-row round trips are not a real cost.
    const actuallyLocked = new Set<string>();
    for (const n of newlyLocked) {
      try {
        const res = exitPriceSupported
          ? await pool.query<{ id: string }>(
              `UPDATE signals SET outcome_locked = $1, outcome_locked_at = now(), outcome_exit_price = $2
                WHERE id = $3 AND outcome_locked IS NULL
                RETURNING id`,
              [n.outcome, n.exitPrice, n.id]
            )
          : await pool.query<{ id: string }>(
              `UPDATE signals SET outcome_locked = $1, outcome_locked_at = now()
                WHERE id = $2 AND outcome_locked IS NULL
                RETURNING id`,
              [n.outcome, n.id]
            );
        if (res.rows[0]) actuallyLocked.add(res.rows[0].id);
      } catch (error) {
        // Non-fatal — the response already has the right outcome for this
        // call; it just won't be locked in for next time until this succeeds.
        console.error("loadLiveSignals: failed to persist outcome lock", n.id, error);
      }
    }

    // Broadcast to the public results channel — this is the product's
    // honesty positioning made literal (every closed call posted, wins and
    // losses both), so it only fires for the exact instant a call actually
    // closes, never re-fires, and never blocks/breaks the ticker response
    // if Telegram is slow or down (announceOutcome is itself best-effort).
    for (const n of newlyLocked) {
      if (!actuallyLocked.has(n.id)) continue;
      await announceOutcome({
        symbol: n.symbol,
        outcome: n.outcome,
        signal: n.signal,
        entry: n.entry,
        exitPrice: n.exitPrice,
        daysIn: n.daysIn,
      });
    }
  }

  return { signals, quotesOk };
}
