import { redirect } from "next/navigation";
import { getPool } from "@/lib/db";
import { getAdminUserId } from "@/lib/admin";
import { ADMIN_COLUMNS, mapAdminRow } from "@/lib/signals-admin";
import { POSITION_COLUMNS, mapPositionRow, loadLivePricesFor } from "@/lib/positions-admin";
import { isIndianStockApiConfigured } from "@/lib/indian-stock-api";
import { listStockAnalyticsStatus } from "@/lib/stock-analytics-cache";
import AdminSignals from "@/components/admin-signals";
import AdminScanMappings from "@/components/admin-scan-mappings";
import AdminPositions from "@/components/admin-positions";
import AdminStockAnalytics from "@/components/admin-stock-analytics";
import { ActivityFeed } from "@/components/activity-feed";

export const dynamic = "force-dynamic";

// Positions ledger (scripts/migration_positions.sql) may not be applied yet —
// degrade to an empty panel instead of a hard 500 if so.
async function loadPositions() {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT ${POSITION_COLUMNS} FROM positions ORDER BY opened_at DESC, id DESC LIMIT 500`
    );
    return rows.map((r) => mapPositionRow(r));
  } catch (error) {
    console.error("failed to load positions data (run scripts/migration_positions.sql?)", error);
    return [];
  }
}

export default async function AdminPage() {
  const adminId = await getAdminUserId();
  if (!adminId) redirect("/dashboard");

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT ${ADMIN_COLUMNS} FROM signals ORDER BY updated_at DESC, id DESC LIMIT 200`
  );
  const { rows: scanRows } = await pool.query(
    "SELECT scan_url, scan_name, signal_type, active FROM scan_mappings ORDER BY scan_name, scan_url"
  );
  const scanMappings = scanRows.map((r) => ({
    scanUrl: r.scan_url,
    scanName: r.scan_name,
    signalType: r.signal_type,
    active: r.active,
  }));
  const positions = await loadPositions();
  const livePrices = await loadLivePricesFor(positions);
  const stockAnalyticsRows = await listStockAnalyticsStatus();

  return (
    <div className="flex flex-1 flex-col bg-zinc-950 text-zinc-100">
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10 md:py-14">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-50 md:text-3xl">
              Admin — signal controls
            </h1>
            <p className="mt-2 text-sm text-zinc-400">
              Suppress, edit, or hand-add signals. Actions are logged to
              signal_events and never undo a webhook&apos;s override decision.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href="/dashboard/admin/users"
              className="rounded-lg border border-sky-600/50 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-400 transition hover:bg-sky-500/20"
            >
              Users →
            </a>
            <a
              href="/dashboard/admin/broker"
              className="rounded-lg border border-emerald-600/50 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/20"
            >
              Broker — Fyers →
            </a>
            <a
              href="/dashboard"
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800"
            >
              ← Back to dashboard
            </a>
          </div>
        </div>
        <AdminSignals signals={rows.map((r) => mapAdminRow(r))} />
        <div className="mt-8">
          <AdminScanMappings initial={scanMappings} />
        </div>
        <div className="mt-8">
          <ActivityFeed />
        </div>
        <div className="mt-8">
          <h2 className="mb-4 text-lg font-semibold tracking-tight text-zinc-50">
            Positions ledger
          </h2>
          <p className="mb-4 text-sm text-zinc-400">
            Track record of daily positions actually posted publicly — separate from
            the live signal feed above. This is the internal source of truth for a
            future win-rate / statistical-edge report.
          </p>
          <AdminPositions positions={positions} livePrices={livePrices} />
        </div>
        <div className="mt-8">
          <h2 className="mb-4 text-lg font-semibold tracking-tight text-zinc-50">
            Stock analytics pipeline
          </h2>
          <p className="mb-4 text-sm text-zinc-400">
            Populates the per-stock research pane (analyst view, shareholding,
            corporate actions, news) shown at /dashboard/stocks/[symbol]. New
            symbols are fetched automatically the first time they show up as a
            signal — use these buttons to backfill or force a fresh pull.
          </p>
          <AdminStockAnalytics rows={stockAnalyticsRows} configured={isIndianStockApiConfigured()} />
        </div>
      </main>
    </div>
  );
}