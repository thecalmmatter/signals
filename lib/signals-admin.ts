// Shared server-side helpers for the admin signals surface (page + API routes).

export const ADMIN_COLUMNS = `
  id, symbol, name, signal_type, price,
  entry_price, target_price, target_price_2, target_price_3, stop_price,
  status, source, trigger_date, scan_name, notes, updated_by, updated_at
`;

export type AdminSignal = {
  id: string;
  symbol: string;
  name: string;
  signalType: "buy" | "sell";
  price: number | null;
  entryPrice: number | null;
  /** T1 / short-term target. */
  targetPrice: number | null;
  /** T2 / medium-term target. */
  targetPrice2: number | null;
  /** T3 / long-term target. */
  targetPrice3: number | null;
  stopPrice: number | null;
  status: string;
  source: "webhook" | "manual";
  triggerDate: string | null;
  scanName: string | null;
  notes: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
};

function fmtDate(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const d = new Date(v as string | number | Date);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

export function mapAdminRow(row: Record<string, unknown>): AdminSignal {
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    id: String(row.id),
    symbol: String(row.symbol),
    name: (row.name ?? row.symbol) as string,
    signalType: row.signal_type as "buy" | "sell",
    price: num(row.price),
    entryPrice: num(row.entry_price),
    targetPrice: num(row.target_price),
    targetPrice2: num(row.target_price_2),
    targetPrice3: num(row.target_price_3),
    stopPrice: num(row.stop_price),
    status: String(row.status),
    source: row.source as "webhook" | "manual",
    triggerDate: fmtDate(row.trigger_date),
    scanName: row.scan_name as string | null,
    notes: row.notes as string | null,
    updatedBy: row.updated_by as string | null,
    updatedAt: row.updated_at ? new Date(row.updated_at as string).toISOString() : null,
  };
}