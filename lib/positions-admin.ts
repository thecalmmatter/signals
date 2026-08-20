// Shared server-side helpers for the admin positions ledger (page + API
// routes). Mirrors lib/signals-admin.ts's COLUMNS/mapRow pattern.

import type { Pool } from "pg";

export const POSITION_COLUMNS = `
  id, signal_id, symbol, direction, entry_price, target_price, stop_price, exit_price,
  status, opened_at, closed_at, notes, created_by, created_at, updated_at
`;

export type AdminPosition = {
  id: string;
  signalId: string | null;
  symbol: string;
  direction: "buy" | "sell";
  entryPrice: number;
  targetPrice: number;
  stopPrice: number;
  exitPrice: number | null;
  status: "open" | "hit_target" | "hit_stop" | "closed_manual";
  openedAt: string | null;
  closedAt: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

function fmtDate(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const d = new Date(v as string | number | Date);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
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
    stopPrice: num(row.stop_price),
    exitPrice: numOrNull(row.exit_price),
    status: row.status as AdminPosition["status"],
    openedAt: fmtDate(row.opened_at),
    closedAt: fmtDate(row.closed_at),
    notes: row.notes as string | null,
    createdBy: row.created_by as string | null,
    createdAt: row.created_at ? new Date(row.created_at as string).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at as string).toISOString() : null,
  };
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
    stopPrice: number;
    openedAt: string | null; // signal's trigger_date, if any — falls back to CURRENT_DATE
    createdBy: string | null;
  }
): Promise<void> {
  await pool.query(
    `INSERT INTO positions
       (signal_id, symbol, direction, entry_price, target_price, stop_price, created_by, opened_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::date, CURRENT_DATE))
     ON CONFLICT (signal_id) WHERE signal_id IS NOT NULL DO UPDATE SET
       symbol       = EXCLUDED.symbol,
       direction    = EXCLUDED.direction,
       entry_price  = EXCLUDED.entry_price,
       target_price = EXCLUDED.target_price,
       stop_price   = EXCLUDED.stop_price,
       updated_at   = now()`,
    [
      params.signalId,
      params.symbol,
      params.direction,
      params.entryPrice,
      params.targetPrice,
      params.stopPrice,
      params.createdBy,
      params.openedAt,
    ]
  );
}
