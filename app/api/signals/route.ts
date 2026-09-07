import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getPool } from "@/lib/db";
import { getAdminContext } from "@/lib/admin";
import { getAccessStatus } from "@/lib/access";
import { ADMIN_COLUMNS, mapAdminRow } from "@/lib/signals-admin";
import { upsertPositionFromSignal } from "@/lib/positions-admin";
import { loadLiveSignals } from "@/lib/live-signals";
import { ensureStockAnalyticsCached } from "@/lib/stock-analytics-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const json = (body: unknown, status: number) => NextResponse.json(body, { status });

function goodNum(v: unknown): number | null | "invalid" {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : "invalid";
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return json({ error: "unauthorized" }, 401);
  const access = await getAccessStatus(userId);
  if (!access.allowed) return json({ error: "subscription required" }, 402);

  try {
    // loadLiveSignals is the single source of truth for "what's live right
    // now" (status='active', one row per symbol, live Fyers quotes merged
    // in) — the track record page reads from the exact same place, so the
    // two can never show different lists.
    const { signals: live } = await loadLiveSignals();

    // TickerStock (lib/stocks.ts) expects non-null entry/target/stop —
    // coerce missing values to 0, same as this route always has (a fresh
    // webhook signal without entry/target/stop filled in yet still shows a
    // card, just with 0s until an admin completes it).
    const signals = live.map((s) => ({
      symbol: s.symbol,
      name: s.name,
      signal: s.signal,
      price: s.price,
      changePct: s.changePct,
      change: s.change,
      entry: s.entry ?? 0,
      target: s.target ?? 0,
      target2: s.target2,
      target3: s.target3,
      stop: s.stop ?? 0,
      // Live-derived — see lib/live-signals.ts computeOutcome(). Drives the
      // DIR badge flipping from BUY/SELL to TARGET HIT/STOPPED once price
      // crosses a level, without needing an admin to manually close it out.
      outcome: s.outcome,
      // No longer shown on the ticker, but the chat feature still uses
      // this as background context — keep it populated, just not rendered.
      daysIn: s.daysIn,
      daysToExit: s.daysToExit,
    }));

    return NextResponse.json({ signals, generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("GET /api/signals failed", error);
    return NextResponse.json(
      { error: "failed to load signals" },
      { status: 500 }
    );
  }
}

// Manually create a signal (admin only). This is the "add by hand a signal
// Chartlink never fired on" path — no webhook involved, source = 'manual'.
export async function POST(req: Request) {
  const ctx = await getAdminContext();
  if (!ctx) return json({ error: "forbidden" }, 403);
  const { userId: adminId, tenant } = ctx;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const symbol = String(body.symbol ?? "").trim().toUpperCase();
  const type = String(body.type ?? "").trim().toLowerCase();
  if (!symbol) return json({ error: "symbol is required" }, 400);
  if (type !== "buy" && type !== "sell") return json({ error: "type must be 'buy' or 'sell'" }, 400);

  const entry = goodNum(body.entryPrice);
  const target = goodNum(body.targetPrice);
  const target2 = goodNum(body.targetPrice2);
  const target3 = goodNum(body.targetPrice3);
  const stop = goodNum(body.stopPrice);
  if (entry === "invalid") return json({ error: "invalid entryPrice" }, 400);
  if (target === "invalid") return json({ error: "invalid targetPrice" }, 400);
  if (target2 === "invalid") return json({ error: "invalid targetPrice2" }, 400);
  if (target3 === "invalid") return json({ error: "invalid targetPrice3" }, 400);
  if (stop === "invalid") return json({ error: "invalid stopPrice" }, 400);
  const notes = body.notes === undefined || body.notes === null ? null : String(body.notes);

  const pool = getPool();

  // Manual rows have NULL trigger_date/scan_url, so the DB's unique
  // constraint (tenant_id, symbol, trigger_date, scan_url) doesn't dedupe
  // them — adding the same symbol twice silently created two active rows.
  // Upsert on the existing active row for this symbol AND this tenant
  // instead of always inserting — scoping by tenant_id here matters as soon
  // as a second tenant exists: without it, one tenant's admin adding a
  // symbol another tenant already has active would silently take over that
  // other tenant's row instead of creating their own.
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM signals WHERE tenant_id = $1 AND symbol = $2 AND status = 'active' ORDER BY updated_at DESC LIMIT 1`,
    [tenant.id, symbol]
  );

  let id: string;
  let eventType: string;
  let eventDetail: string;

  if (existing.rows[0]) {
    id = existing.rows[0].id;
    await pool.query(
      `UPDATE signals
          SET signal_type = $1, entry_price = $2, target_price = $3, target_price_2 = $4,
              target_price_3 = $5, stop_price = $6,
              source = 'manual', updated_by = $7, notes = $8, updated_at = now()
        WHERE id = $9`,
      [type, entry, target, target2, target3, stop, adminId, notes, id]
    );
    eventType = "manual_edited";
    eventDetail = `manual add re-used existing active row (entry=${entry}, target=${target}, stop=${stop})`;
  } else {
    // tenant_id is NOT NULL (scripts/migration_tenants.sql) — stamped with
    // the resolved admin's own tenant (Phase 2, lib/admin.ts), so a
    // reseller's admin creates signals under their own tenant, not the
    // operator's.
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO signals
         (tenant_id, symbol, name, signal_type, entry_price, target_price, target_price_2, target_price_3, stop_price,
          source, updated_by, notes, status, generated_at, updated_at, days_in)
       VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, 'manual', $9, $10, 'active', now(), now(), 0)
       RETURNING id`,
      [tenant.id, symbol, type, entry, target, target2, target3, stop, adminId, notes]
    );
    id = inserted.rows[0].id;
    eventType = "manual_created";
    eventDetail = "manually created signal (source=manual)";
  }

  await pool.query(
    `INSERT INTO signal_events (signal_id, event_type, symbol, detail, raw_payload)
     VALUES ($1, $2, $3, $4, NULL)`,
    [id, eventType, symbol, eventDetail]
  );

  // Auto-populate the track-record ledger — entry/target/stop are always
  // present on a manual add, so this always fires here (no separate "log
  // this position" step needed). Never blocks the signal write.
  if (entry !== null && target !== null && stop !== null) {
    try {
      await upsertPositionFromSignal(pool, {
        tenantId: tenant.id,
        signalId: id,
        symbol,
        direction: type as "buy" | "sell",
        entryPrice: entry,
        targetPrice: target,
        targetPrice2: target2,
        targetPrice3: target3,
        stopPrice: stop,
        openedAt: null,
        createdBy: adminId,
      });
    } catch (error) {
      console.error("upsertPositionFromSignal failed (run scripts/migration_positions_signal_link.sql?)", error);
    }
  }

  // Best-effort — populates the stock analytics cache the first time this
  // symbol is manually added, so /dashboard/stocks/[symbol] is ready without
  // waiting for an admin to click refresh. No-ops instantly if already cached.
  await ensureStockAnalyticsCached(symbol);

  const row = await pool.query(`SELECT ${ADMIN_COLUMNS} FROM signals WHERE id = $1`, [id]);
  return json({ signal: mapAdminRow(row.rows[0]) }, existing.rows[0] ? 200 : 201);
}