// Two independent periodic posts to the public results channel, both
// separate from the instant per-close post in lib/telegram-results.ts:
//
// 1. "Closed summary" (postDigestIfDue) — rolls up everything that closed
//    since the last post into one win/loss recap. Scope is deliberately
//    "since last digest", not all-time cumulative, so each post reads like
//    a fresh update.
// 2. "Snapshot" (postSnapshotIfDue) — a compact symbol/return/days table of
//    every currently-active signal (open, stopped, and target-hit alike),
//    same shape as the /dashboard/track-record page. Posts unconditionally
//    on its own schedule, not gated on anything having changed.
//
// Both are called from app/api/cron/telegram-digest/route.ts on the same
// cron trigger, but track their own last-posted timestamp independently —
// see scripts/migration_telegram_snapshot_digest.sql (telegram_digest_state
// is keyed by `kind`) and scripts/migration_telegram_digest.sql
// (signals.outcome_exit_price, needed by the closed summary only).

import type { Pool } from "pg";
import { isResultsChannelConfigured, sendResultsChannelMessage } from "./telegram-results";
import { loadLiveSignals, type LiveSignal } from "./live-signals";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type DigestKind = "closed_summary" | "snapshot";

/**
 * How often a given post kind should actually fire, in hours. Read fresh on
 * every call (no caching) so changing it in Vercel env vars takes effect on
 * the next cron tick — no redeploy needed. The cron trigger itself
 * (vercel.json) still only fires once a day on Vercel's Hobby plan, so this
 * can extend the interval (e.g. 48 to post every other day) but can't go
 * more frequent than daily unless the underlying cron schedule also changes
 * (Pro plan).
 */
function getIntervalHours(kind: DigestKind): number {
  const envVar = kind === "closed_summary" ? "DIGEST_INTERVAL_HOURS" : "SNAPSHOT_INTERVAL_HOURS";
  const raw = Number(process.env[envVar]);
  return Number.isFinite(raw) && raw > 0 ? raw : 24;
}

async function getLastPostedAt(pool: Pool, kind: DigestKind): Promise<Date | null> {
  const { rows } = await pool.query<{ last_posted_at: Date | null }>(
    `SELECT last_posted_at FROM telegram_digest_state WHERE kind = $1`,
    [kind]
  );
  return rows[0]?.last_posted_at ?? null;
}

async function setLastPostedAt(pool: Pool, kind: DigestKind, at: Date): Promise<void> {
  await pool.query(
    `INSERT INTO telegram_digest_state (kind, last_posted_at) VALUES ($1, $2)
     ON CONFLICT (kind) DO UPDATE SET last_posted_at = EXCLUDED.last_posted_at`,
    [kind, at]
  );
}

// ---------------------------------------------------------------------------
// 1. Closed summary — everything that closed since the last post.
// ---------------------------------------------------------------------------

type ClosedRow = {
  symbol: string;
  signal_type: "buy" | "sell" | "watch";
  entry_price: number | null;
  outcome_locked: "target_hit" | "stopped";
  outcome_exit_price: number | null;
  outcome_locked_at: Date;
};

async function queryClosedSince(pool: Pool, since: Date | null): Promise<ClosedRow[]> {
  // since = null means "no digest has ever posted" — report everything
  // that's currently closed, so the very first digest isn't empty.
  const { rows } = await pool.query<ClosedRow>(
    `SELECT symbol, signal_type, entry_price, outcome_locked, outcome_exit_price, outcome_locked_at
       FROM signals
      WHERE outcome_locked IS NOT NULL
        AND outcome_exit_price IS NOT NULL
        AND ($1::timestamptz IS NULL OR outcome_locked_at > $1)
      ORDER BY outcome_locked_at ASC`,
    [since]
  );
  return rows;
}

function closedReturnPct(row: ClosedRow): number | null {
  if (!row.entry_price || row.entry_price <= 0 || row.outcome_exit_price === null) return null;
  const raw = ((row.outcome_exit_price - row.entry_price) / row.entry_price) * 100;
  return row.signal_type === "sell" ? -raw : raw;
}

function formatClosedSummary(rows: ClosedRow[]): string {
  const lines = rows.map((r) => {
    const pct = closedReturnPct(r);
    const dot = r.outcome_locked === "target_hit" ? "🟢" : "🔴";
    const pctText = pct === null ? "" : ` ${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
    return `${dot} <b>${esc(r.symbol)}</b>${pctText}`;
  });

  const wins = rows.filter((r) => r.outcome_locked === "target_hit").length;
  const losses = rows.length - wins;
  const pcts = rows.map(closedReturnPct).filter((p): p is number => p !== null);
  const avg = pcts.length > 0 ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
  const avgText = avg === null ? "" : ` · avg ${avg >= 0 ? "+" : ""}${avg.toFixed(1)}%`;

  const header = "📊 <b>Track record update</b>";
  const footer = `${rows.length} closed · ${wins}🟢 ${losses}🔴${avgText}`;
  return [header, "", ...lines, "", footer].join("\n");
}

/**
 * Posts only if (a) the channel is configured, (b) enough time has elapsed
 * since the last post, and (c) there's actually something closed to report
 * — a quiet stretch just leaves last_posted_at untouched so the next check
 * still looks back to the same point instead of silently skipping a close
 * that happened during the gap.
 */
export async function postDigestIfDue(pool: Pool): Promise<{ posted: boolean; count: number }> {
  if (!isResultsChannelConfigured()) return { posted: false, count: 0 };

  const lastPostedAt = await getLastPostedAt(pool, "closed_summary");
  if (lastPostedAt) {
    const elapsedHours = (Date.now() - lastPostedAt.getTime()) / (1000 * 60 * 60);
    if (elapsedHours < getIntervalHours("closed_summary")) return { posted: false, count: 0 };
  }

  const rows = await queryClosedSince(pool, lastPostedAt);
  if (rows.length === 0) return { posted: false, count: 0 };

  await sendResultsChannelMessage(formatClosedSummary(rows));
  await setLastPostedAt(pool, "closed_summary", new Date());
  return { posted: true, count: rows.length };
}

// ---------------------------------------------------------------------------
// 2. Snapshot — symbol / return / days for every currently-active signal.
// ---------------------------------------------------------------------------

function snapshotReturnPct(s: LiveSignal): number | null {
  if (!s.entry || s.entry <= 0 || s.signal === "watch") return null;
  const raw = ((s.price - s.entry) / s.entry) * 100;
  return s.signal === "sell" ? -raw : raw;
}

// Telegram's monospace <pre> block is the only way to fake table columns —
// there's no real HTML <table>. Column widths are computed per-post from
// the actual symbol lengths so this doesn't hardcode to today's longest
// name. The 🟢/🔴 prefix is a fixed 2-character width on every data row
// (never present on the header), so the SYMBOL column still lines up even
// though emoji glyphs render slightly differently across Telegram clients.
function formatSnapshot(signals: LiveSignal[]): string {
  const symbolWidth = Math.max(6, ...signals.map((s) => s.symbol.length));
  const header = `  ${"SYMBOL".padEnd(symbolWidth)} ${"RETURN".padStart(7)}  DAYS`;
  const lines = signals.map((s) => {
    const pct = snapshotReturnPct(s);
    const dot = pct === null ? "⚪" : pct >= 0 ? "🟢" : "🔴";
    const pctText = pct === null ? "—" : `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
    return `${dot} ${s.symbol.padEnd(symbolWidth)} ${pctText.padStart(7)}  ${String(s.daysIn).padStart(3)}`;
  });
  return ["📋 <b>Live signals snapshot</b>", "", `<pre>${esc([header, ...lines].join("\n"))}</pre>`].join("\n");
}

/**
 * Unlike the closed summary, this one has no "nothing to report" case —
 * open positions always exist to show — so it posts unconditionally once
 * the interval has elapsed, as long as there's at least one active signal.
 * Reuses loadLiveSignals(), the same source the ticker and track-record
 * page read from, so the numbers here can never disagree with the app.
 * Side effect: this also runs the same outcome-lock check loadLiveSignals()
 * always does, so a cron-triggered snapshot can itself be the thing that
 * catches a newly-crossed target/stop if nobody happened to have the
 * dashboard open at that moment.
 */
export async function postSnapshotIfDue(pool: Pool): Promise<{ posted: boolean; count: number }> {
  if (!isResultsChannelConfigured()) return { posted: false, count: 0 };

  const lastPostedAt = await getLastPostedAt(pool, "snapshot");
  if (lastPostedAt) {
    const elapsedHours = (Date.now() - lastPostedAt.getTime()) / (1000 * 60 * 60);
    if (elapsedHours < getIntervalHours("snapshot")) return { posted: false, count: 0 };
  }

  const { signals } = await loadLiveSignals();
  if (signals.length === 0) return { posted: false, count: 0 };

  await sendResultsChannelMessage(formatSnapshot(signals));
  await setLastPostedAt(pool, "snapshot", new Date());
  return { posted: true, count: signals.length };
}
