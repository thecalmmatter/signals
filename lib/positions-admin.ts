// Shared helpers for the positions ledger — used by the admin ledger
// (page + API routes) AND the public-facing track record page, so both show
// identical numbers computed the same way. Mirrors lib/signals-admin.ts's
// COLUMNS/mapRow pattern.

import type { Pool } from "pg";
import { getQuotes } from "./fyers";

export const POSITION_COLUMNS = `
  id, signal_id, symbol, direction, entry_price,
  target_price, target_price_2, target_price_3, stop_price, exit_price,
  status, opened_at, closed_at, notes, created_by, created_at, updated_at,
  target_1_hit_at, target_2_hit_at, target_3_hit_at
`;

export type AdminPosition = {
  id: string;
  signalId: string | null;
  symbol: string;
  direction: "buy" | "sell";
  entryPrice: number;
  /** T1 / short-term target. */
  targetPrice: number;
  /** T2 / medium-term target — not every position has one yet. */
  targetPrice2: number | null;
  /** T3 / long-term target — not every position has one yet. */
  targetPrice3: number | null;
  stopPrice: number;
  exitPrice: number | null;
  status: "open" | "hit_target" | "hit_stop" | "closed_manual";
  openedAt: string | null;
  closedAt: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  /**
   * Independent per-target hit tracking — a position can have T1 hit while
   * still open, waiting on T2/T3 or the stop. Separate from `status`, which
   * still tracks the overall open/hit_stop/closed_manual outcome.
   */
  target1HitAt: string | null;
  target2HitAt: string | null;
  target3HitAt: string | null;
};

function fmtDate(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const d = new Date(v as string | number | Date);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

function fmtTimestamp(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return new Date(v as string | number | Date).toISOString();
}

export function mapPositionRow(row: Record<string, unknown>): AdminPosition {
  const num = (v: unknown) => Number(v);
  const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    id: String(row.id),
    signalId: row.signal_id === null || row.signal_id === undefined ? null : String(row.signal_id),
    symbol: String(row.symbol),
    direction: row.direction as "buy" | "sell",
    entryPrice: num(row.entry_price),
    targetPrice: num(row.target_price),
    targetPrice2: numOrNull(row.target_price_2),
    targetPrice3: numOrNull(row.target_price_3),
    stopPrice: num(row.stop_price),
    exitPrice: numOrNull(row.exit_price),
    status: row.status as AdminPosition["status"],
    openedAt: fmtDate(row.opened_at),
    closedAt: fmtDate(row.closed_at),
    notes: row.notes as string | null,
    createdBy: row.created_by as string | null,
    createdAt: row.created_at ? new Date(row.created_at as string).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at as string).toISOString() : null,
    target1HitAt: fmtTimestamp(row.target_1_hit_at),
    target2HitAt: fmtTimestamp(row.target_2_hit_at),
    target3HitAt: fmtTimestamp(row.target_3_hit_at),
  };
}

export const STATUS_STYLE: Record<string, string> = {
  open: "bg-sky-500/15 text-sky-400 ring-sky-400/30",
  hit_target: "bg-emerald-500/15 text-emerald-400 ring-emerald-400/30",
  hit_stop: "bg-red-500/15 text-red-400 ring-red-400/30",
  closed_manual: "bg-zinc-700/40 text-zinc-400 ring-zinc-500/30",
};

export const STATUS_LABEL: Record<string, string> = {
  open: "open",
  hit_target: "hit target",
  hit_stop: "hit stop",
  closed_manual: "closed (manual)",
};

// Days between opened_at and closed_at (or today, if still open). Dates are
// plain YYYY-MM-DD strings (see fmtDate above) — parsed as UTC midnight so
// this doesn't drift a day depending on the caller's timezone.
export function daysHeld(openedAt: string | null, closedAt: string | null): number | null {
  if (!openedAt) return null;
  const start = new Date(`${openedAt}T00:00:00Z`).getTime();
  if (Number.isNaN(start)) return null;
  const end = closedAt ? new Date(`${closedAt}T00:00:00Z`).getTime() : Date.now();
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

// Return since entry, as a %. Open positions use the live quote (undefined
// if Fyers is down/unconfigured or this symbol has no quote — degrades to
// null rather than a wrong number). Closed positions use the stored
// exit_price instead, no live call needed. Flips sign for sell/short.
export function returnPct(p: AdminPosition, livePrice: number | undefined): number | null {
  const current = p.status === "open" ? (livePrice ?? null) : p.exitPrice;
  if (current === null || current === undefined || !p.entryPrice) return null;
  const raw = ((current - p.entryPrice) / p.entryPrice) * 100;
  return p.direction === "sell" ? -raw : raw;
}

/**
 * Live price per open position's symbol, for the "return since entry"
 * column — closed positions use their stored exit_price instead, no live
 * call needed. Best-effort: Fyers being unconfigured/down degrades to no
 * live prices (callers should render "—") rather than breaking the page.
 */
export async function loadLivePricesFor(positions: AdminPosition[]): Promise<Record<string, number>> {
  const symbols = [...new Set(positions.filter((p) => p.status === "open").map((p) => p.symbol))];
  if (symbols.length === 0) return {};
  try {
    const quotes = await getQuotes(symbols);
    return Object.fromEntries([...quotes.entries()].map(([symbol, q]) => [symbol, q.ltp]));
  } catch (error) {
    console.error("failed to load live prices for positions ledger", error);
    return {};
  }
}

/**
 * Auto-populates the track-record ledger from a signal, instead of the admin
 * re-typing entry/target/stop into a separate "log this position" form.
 * Called whenever a signal's entry/target/stop are all set (on manual add,
 * and on any edit that fills them in — e.g. completing a webhook-triggered
 * signal that arrived without prices).
 *
 * One ledger row per signal (positions.signal_id is uniquely indexed), so
 * re-saving a signal's prices updates its existing position instead of
 * creating a duplicate. Requires scripts/migration_positions_signal_link.sql
 * — callers should catch and log rather than fail the signal write if this
 * throws (e.g. migration not applied yet).
 */
export async function upsertPositionFromSignal(
  pool: Pool,
  params: {
    signalId: string | number;
    symbol: string;
    direction: "buy" | "sell";
    entryPrice: number;
    targetPrice: number;
    targetPrice2?: number | null;
    targetPrice3?: number | null;
    stopPrice: number;
    openedAt: string | null; // signal's trigger_date, if any — falls back to CURRENT_DATE
    createdBy: string | null;
  }
): Promise<void> {
  await pool.query(
    `INSERT INTO positions
       (signal_id, symbol, direction, entry_price, target_price, target_price_2, target_price_3,
        stop_price, created_by, opened_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::date, CURRENT_DATE))
     ON CONFLICT (signal_id) WHERE signal_id IS NOT NULL DO UPDATE SET
       symbol         = EXCLUDED.symbol,
       direction      = EXCLUDED.direction,
       entry_price    = EXCLUDED.entry_price,
       target_price   = EXCLUDED.target_price,
       target_price_2 = EXCLUDED.target_price_2,
       target_price_3 = EXCLUDED.target_price_3,
       stop_price     = EXCLUDED.stop_price,
       updated_at     = now()`,
    [
      params.signalId,
      params.symbol,
      params.direction,
      params.entryPrice,
      params.targetPrice,
      params.targetPrice2 ?? null,
      params.targetPrice3 ?? null,
      params.stopPrice,
      params.createdBy,
      params.openedAt,
    ]
  );
}

/**
 * Marks (or unmarks) one of the three independent target-hit timestamps on a
 * position. Doesn't touch `status` — hitting T1 doesn't necessarily close
 * the position (partial-profit-booking style trading), only hitting the
 * stop or an explicit manual close does.
 */
export async function setTargetHit(
  pool: Pool,
  id: string,
  target: 1 | 2 | 3,
  hit: boolean
): Promise<void> {
  const col = `target_${target}_hit_at`;
  await pool.query(
    `UPDATE positions SET ${col} = ${hit ? "now()" : "NULL"}, updated_at = now() WHERE id = $1`,
    [id]
  );
}
