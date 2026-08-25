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

/**
 * Live, price-derived outcome — never stored, always recomputed from the
 * current quote against the signal's own targets/stop. This is what powers
 * the DIR badge flipping from "BUY" to "TARGET HIT"/"STOPPED" automatically
 * once price crosses one of those levels, instead of a signal sitting there
 * looking like an open BUY forever until an admin manually suppresses it.
 */
export type SignalOutcome = "open" | "target_hit" | "stopped";

/**
 * Any of T1/T2/T3 hit (favorable direction) → "target_hit".
 * Stop crossed (unfavorable direction) → "stopped".
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
    if (set.some((t) => price >= t)) return "target_hit";
  } else {
    if (stop && stop > 0 && price >= stop) return "stopped";
    if (set.some((t) => price <= t)) return "target_hit";
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

export async function loadLiveSignals(): Promise<{ signals: LiveSignal[]; quotesOk: boolean }> {
  const { rows } = await getPool().query(
    `SELECT * FROM (
       SELECT DISTINCT ON (symbol)
              symbol, name, signal_type, price,
              entry_price, target_price, target_price_2, target_price_3, stop_price,
              days_in, days_to_exit, status, generated_at, updated_at
         FROM signals
        WHERE status = 'active'
        ORDER BY symbol, updated_at DESC
     ) t
     ORDER BY generated_at DESC, symbol`
  );

  let quotes = new Map<string, Quote>();
  let quotesOk = true;
  try {
    quotes = await getQuotesCached(rows.map((r) => r.symbol as string));
  } catch (error) {
    console.error("loadLiveSignals: live quotes unavailable, falling back to stored price", error);
    quotesOk = false;
  }

  const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));

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
      outcome: computeOutcome(signalType, price, [target, target2, target3], stop),
      daysIn: Number(r.days_in) || 0,
      daysToExit: Number(r.days_to_exit) || 0,
      generatedAt: new Date(r.generated_at as string).toISOString(),
    };
  });

  return { signals, quotesOk };
}
