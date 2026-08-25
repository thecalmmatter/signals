import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getAdminUserId } from "@/lib/admin";
import { POSITION_COLUMNS, mapPositionRow, setTargetHit } from "@/lib/positions-admin";

export const dynamic = "force-dynamic";

const ALLOWED_STATUS = ["open", "hit_target", "hit_stop", "closed_manual"];

const json = (body: unknown, status: number) => NextResponse.json(body, { status });

function goodNum(v: unknown): number | null | "invalid" {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : "invalid";
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
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
  const prevRes = await pool.query("SELECT id FROM positions WHERE id = $1", [id]);
  if (!prevRes.rows[0]) return json({ error: "not found" }, 404);

  const sets: string[] = [];
  const vals: unknown[] = [];
  const P = (v: unknown) => {
    vals.push(v);
    return `$${vals.length}`;
  };

  if (body.status !== undefined) {
    const s = String(body.status);
    if (!ALLOWED_STATUS.includes(s)) return json({ error: "invalid status" }, 400);
    sets.push(`status = ${P(s)}`);
    // Leaving "open" without an explicit closedAt in the same request?
    // Default it to today so the row doesn't look closed-but-dateless.
    if (s !== "open" && body.closedAt === undefined) {
      sets.push(`closed_at = ${P(new Date().toISOString().slice(0, 10))}`);
    }
  }

  for (const [key, col] of [
    ["entryPrice", "entry_price"],
    ["targetPrice", "target_price"],
    ["targetPrice2", "target_price_2"],
    ["targetPrice3", "target_price_3"],
    ["stopPrice", "stop_price"],
    ["exitPrice", "exit_price"],
  ] as const) {
    if (body[key] === undefined) continue;
    const n = goodNum(body[key]);
    if (n === "invalid") return json({ error: `invalid ${key}` }, 400);
    sets.push(`${col} = ${P(n)}`);
  }

  for (const [key, col] of [
    ["openedAt", "opened_at"],
    ["closedAt", "closed_at"],
  ] as const) {
    if (body[key] === undefined) continue;
    const v = body[key] === null || body[key] === "" ? null : String(body[key]);
    sets.push(`${col} = ${P(v)}`);
  }

  if (body.notes !== undefined) {
    const v = body.notes === null ? null : String(body.notes);
    sets.push(`notes = ${P(v)}`);
  }

  // Independent per-target hit markers — { target1Hit: true|false, ... }.
  // Separate UPDATEs via setTargetHit (not part of the dynamic `sets` above)
  // since they don't touch `status`: T1 can be marked hit while the
  // position stays open, waiting on T2/T3 or the stop.
  let targetHitChanged = false;
  for (const [key, target] of [
    ["target1Hit", 1],
    ["target2Hit", 2],
    ["target3Hit", 3],
  ] as const) {
    if (body[key] === undefined) continue;
    await setTargetHit(pool, id, target, Boolean(body[key]));
    targetHitChanged = true;
  }

  if (sets.length === 0 && !targetHitChanged) return json({ error: "no fields to update" }, 400);

  if (sets.length > 0) {
    sets.push(`updated_at = now()`);
    await pool.query(`UPDATE positions SET ${sets.join(", ")} WHERE id = ${P(id)}`, vals);
  }

  const updated = await pool.query(`SELECT ${POSITION_COLUMNS} FROM positions WHERE id = $1`, [id]);
  return json({ position: mapPositionRow(updated.rows[0]) }, 200);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId();
  if (!adminId) return json({ error: "forbidden" }, 403);

  const { id } = await ctx.params;
  const pool = getPool();
  const res = await pool.query("DELETE FROM positions WHERE id = $1 RETURNING id", [id]);
  if (!res.rows[0]) return json({ error: "not found" }, 404);

  return json({ ok: true, id }, 200);
}
