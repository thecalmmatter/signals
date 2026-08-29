// Periodic "symbols + overall return" summary for the public results
// channel — separate from the instant per-close post in
// lib/telegram-results.ts. That one fires the moment a single call closes;
// this one runs on a schedule (see app/api/cron/telegram-digest/route.ts)
// and rolls up everything that closed since the last digest into one post.
//
// Scope is deliberately "since last digest", not all-time cumulative — each
// post should read like a fresh update, not a repeat of names already
// covered. See scripts/migration_telegram_digest.sql for the two schema
// pieces this depends on: signals.outcome_exit_price (frozen exit price,
// so returns here don't drift with the live quote) and the single-row
// telegram_digest_state table (last_posted_at).

import type { Pool } from "pg";
import { isResultsChannelConfigured, sendResultsChannelMessage } from "./telegram-results";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * How often the digest should actually post, in hours. Read fresh on every
 * call (no caching) so changing it in Vercel env vars takes effect on the
 * next cron tick — no redeploy needed. The cron trigger itself (vercel.json)
 * still only fires once a day on Vercel's Hobby plan, so this can extend the
 * interval (e.g. 48 to post every other day) but can't go more frequent than
 * daily unless the underlying cron schedule is also changed (Pro plan).
 */
function getIntervalHours(): number {
  const raw = Number(process.env.DIGEST_INTERVAL_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : 24;
}

async function getLastPostedAt(pool: Pool): Promise<Date | null> {
  const { rows } = await pool.query<{ last_posted_at: Date | null }>(
    `SELECT last_posted_at FROM telegram_digest_state WHERE id = true`
  );
  return rows[0]?.last_posted_at ?? null;
}

async function setLastPostedAt(pool: Pool, at: Date): Promise<void> {
  await pool.query(
    `INSERT INTO telegram_digest_state (id, last_posted_at) VALUES (true, $1)
     ON CONFLICT (id) DO UPDATE SET last_posted_at = EXCLUDED.last_posted_at`,
    [at]
  );
}

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

function returnPct(row: ClosedRow): number | null {
  if (!row.entry_price || row.entry_price <= 0 || row.outcome_exit_price === null) return null;
  const raw = ((row.outcome_exit_price - row.entry_price) / row.entry_price) * 100;
  return row.signal_type === "sell" ? -raw : raw;
}

function formatDigest(rows: ClosedRow[]): string {
  const lines = rows.map((r) => {
    const pct = returnPct(r);
    const dot = r.outcome_locked === "target_hit" ? "🟢" : "🔴";
    const pctText = pct === null ? "" : ` ${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
    return `${dot} <b>${esc(r.symbol)}</b>${pctText}`;
  });

  const wins = rows.filter((r) => r.outcome_locked === "target_hit").length;
  const losses = rows.length - wins;
  const pcts = rows.map(returnPct).filter((p): p is number => p !== null);
  const avg = pcts.length > 0 ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
  const avgText = avg === null ? "" : ` · avg ${avg >= 0 ? "+" : ""}${avg.toFixed(1)}%`;

  const header = "📊 <b>Track record update</b>";
  const footer = `${rows.length} closed · ${wins}🟢 ${losses}🔴${avgText}`;
  return [header, "", ...lines, "", footer].join("\n");
}

/**
 * Called by the cron route. Posts only if (a) the channel is configured,
 * (b) enough time has elapsed since the last post, and (c) there's actually
 * something closed to report — a quiet stretch just leaves last_posted_at
 * untouched so the next check still looks back to the same point instead of
 * silently skipping a close that happened during the gap.
 */
export async function postDigestIfDue(pool: Pool): Promise<{ posted: boolean; count: number }> {
  if (!isResultsChannelConfigured()) return { posted: false, count: 0 };

  const lastPostedAt = await getLastPostedAt(pool);
  if (lastPostedAt) {
    const elapsedHours = (Date.now() - lastPostedAt.getTime()) / (1000 * 60 * 60);
    if (elapsedHours < getIntervalHours()) return { posted: false, count: 0 };
  }

  const rows = await queryClosedSince(pool, lastPostedAt);
  if (rows.length === 0) return { posted: false, count: 0 };

  await sendResultsChannelMessage(formatDigest(rows));
  await setLastPostedAt(pool, new Date());
  return { posted: true, count: rows.length };
}
