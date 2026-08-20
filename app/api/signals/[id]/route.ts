import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getAdminUserId } from "@/lib/admin";
import { ADMIN_COLUMNS, mapAdminRow } from "@/lib/signals-admin";
import { upsertPositionFromSignal } from "@/lib/positions-admin";

export const dynamic = "force-dynamic";

const ALLOWED_STATUS = ["active", "suppressed", "manual_override", "expired", "hit_target", "hit_stop"];

function goodNum(v: unknown): number | null | "invalid" {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : "invalid";
}

const json = (body: unknown, status: number) => NextResponse.json(body, { status });

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const adminId = await getAdminUserId();
  if (!adminId) return json({ error: "forbidden" }, 403);

  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const pool = getPool();
  const prevRes = await pool.query(
    "SELECT id, status, symbol, trigger_date, scan_name FROM signals WHERE id = $1",
    [id]
  );
  if (!prevRes.rows[0]) return json({ error: "not found" }, 404);
  const prev = prevRes.rows[0];

  const sets: string[] = [];
  const vals: unknown[] = [];
  const P = (v: unknown) => {
    vals.push(v);
    return `$${vals.length}`;
  };

  let nextStatus: string | null = null;
  if (body.status !== undefined) {
    const s = String(body.status);
    if (!ALLOWED_STATUS.includes(s)) return json({ error: "invalid status" }, 400);
    sets.push(`status = ${P(s)}`);
    nextStatus = s;
  }

  for (const [key, col] of [
    ["entryPrice", "entry_price"],
    ["targetPrice", "target_price"],
    ["stopPrice", "stop_price"],
  ] as const) {
    if (body[key] === undefined) continue;
    const n = goodNum(body[key]);
    if (n === "invalid") return json({ error: `invalid ${key}` }, 400);
    sets.push(`${col} = ${P(n)}`);
  }

  if (body.notes !== undefined) {
    const v = body.notes === null ? null : String(body.notes);
    sets.push(`notes = ${P(v)}`);
  }

  sets.push(`updated_by = ${P(adminId)}`, `updated_at = now()`);

  // Event type + human-readable detail of what changed.
  let eventType = "manual_edited";
  const changes: string[] = [];
  if (nextStatus !== null && nextStatus !== prev.status) {
    changes.push(`status ${prev.status}->${nextStatus}`);
    if (nextStatus === "suppressed") eventType = "manual_suppressed";
    else if (nextStatus === "active") eventType = "manual_reactivated";
  }
  if (body.entryPrice !== undefined) changes.push(`entry=${body.entryPrice}`);
  if (body.targetPrice !== undefined) changes.push(`target=${body.targetPrice}`);
  if (body.stopPrice !== undefined) changes.push(`stop=${body.stopPrice}`);
  if (body.notes !== undefined) changes.push("notes");
  const detail = changes.length ? changes.join("; ") : "no fields changed";

  await pool.query(`UPDATE signals SET ${sets.join(", ")} WHERE id = ${P(id)}`, vals);

  // Manual actions: raw_payload is NULL (there is no webhook payload behind it).
  await pool.query(
    `INSERT INTO signal_events (signal_id, event_type, symbol, trigger_date, scan_name, detail, raw_payload)
     VALUES ($1, $2, $3, $4, $5, $6, NULL)`,
    [id, eventType, prev.symbol, prev.trigger_date, prev.scan_name, detail]
  );

  const updated = await pool.query(`SELECT ${ADMIN_COLUMNS} FROM signals WHERE id = $1`, [id]);
  const fresh = updated.rows[0];

  // Auto-populate the track-record ledger the moment entry/target/stop are
  // all present — including the common case of completing a webhook-
  // triggered signal that arrived with no prices. No separate "log this
  // position" step needed. Never blocks the signal write.
  if (fresh.entry_price !== null && fresh.target_price !== null && fresh.stop_price !== null) {
    try {
      await upsertPositionFromSignal(pool, {
        signalId: id,
        symbol: String(fresh.symbol),
        direction: fresh.signal_type as "buy" | "sell",
        entryPrice: Number(fresh.entry_price),
        targetPrice: Number(fresh.target_price),
        stopPrice: Number(fresh.stop_price),
        openedAt: fresh.trigger_date as string | null,
        createdBy: adminId,
      });
    } catch (error) {
      console.error("upsertPositionFromSignal failed (run scripts/migration_positions_signal_link.sql?)", error);
    }
  }

  return json({ signal: mapAdminRow(fresh) }, 200);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId();
  if (!adminId) return json({ error: "forbidden" }, 403);

  const { id } = await ctx.params;
  const pool = getPool();
  const prevRes = await pool.query(
    "SELECT id, symbol, trigger_date, scan_name FROM signals WHERE id = $1",
    [id]
  );
  if (!prevRes.rows[0]) return json({ error: "not found" }, 404);
  const prev = prevRes.rows[0];

  // Trace the removal, then delete the row. The signal_events FK is
  // ON DELETE SET NULL, so it keeps the symbol/date/scan context.
  await pool.query(
    `INSERT INTO signal_events (signal_id, event_type, symbol, trigger_date, scan_name, detail, raw_payload)
     VALUES ($1, 'manual_edited', $2, $3, $4, 'signal deleted by admin', NULL)`,
    [id, prev.symbol, prev.trigger_date, prev.scan_name]
  );
  await pool.query("DELETE FROM signals WHERE id = $1", [id]);

  return json({ ok: true, id }, 200);
}