// Shared server-side helpers for the admin positions ledger (page + API
// routes). Mirrors lib/signals-admin.ts's COLUMNS/mapRow pattern.

export const POSITION_COLUMNS = `
  id, symbol, direction, entry_price, target_price, stop_price, exit_price,
  status, opened_at, closed_at, notes, created_by, created_at, updated_at
`;

export type AdminPosition = {
  id: string;
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
