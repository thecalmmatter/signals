import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getAdminUserId } from "@/lib/admin";
import { POSITION_COLUMNS, mapPositionRow } from "@/lib/positions-admin";

export const dynamic = "force-dynamic";

const json = (body: unknown, status: number) => NextResponse.json(body, { status });

function goodNum(v: unknown): number | "invalid" {
  const n = Number(v);
  return v !== null && v !== undefined && v !== "" && Number.isFinite(n) ? n : "invalid";
}

// List the track record (admin only — this is the internal ledger, not a
// public page yet).
export async function GET() {
  const adminId = await getAdminUserId();
  if (!adminId) return json({ error: "forbidden" }, 403);

  try {
    const { rows } = await getPool().query(
      `SELECT ${POSITION_COLUMNS} FROM positions ORDER BY opened_at DESC, id DESC LIMIT 500`
    );
    return json({ positions: rows.map((r) => mapPositionRow(r)) }, 200);
  } catch (error) {
    console.error("GET /api/admin/positions failed (run scripts/migration_positions.sql?)", error);
    return json({ positions: [] }, 200);
  }
}

// Log a position that was posted publicly (admin only).
export async function POST(req: Request) {
  const adminId = await getAdminUserId();
  if (!adminId) return json({ error: "forbidden" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const symbol = String(body.symbol ?? "").trim().toUpperCase();
  const direction = String(body.direction ?? "").trim().toLowerCase();
  if (!symbol) return json({ error: "symbol is required" }, 400);
  if (direction !== "buy" && direction !== "sell") {
    return json({ error: "direction must be 'buy' or 'sell'" }, 400);
  }

  const entry = goodNum(body.entryPrice);
  const target = goodNum(body.targetPrice);
  const stop = goodNum(body.stopPrice);
  if (entry === "invalid") return json({ error: "entryPrice is required and must be a number" }, 400);
  if (target === "invalid") return json({ error: "targetPrice is required and must be a number" }, 400);
  if (stop === "invalid") return json({ error: "stopPrice is required and must be a number" }, 400);

  const notes = body.notes === undefined || body.notes === null ? null : String(body.notes);
  const openedAt = body.openedAt ? String(body.openedAt) : null;

  const pool = getPool();
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO positions
       (symbol, direction, entry_price, target_price, stop_price, notes, created_by, opened_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::date, CURRENT_DATE))
     RETURNING id`,
    [symbol, direction, entry, target, stop, notes, adminId, openedAt]
  );

  const row = await pool.query(`SELECT ${POSITION_COLUMNS} FROM positions WHERE id = $1`, [inserted.rows[0].id]);
  return json({ position: mapPositionRow(row.rows[0]) }, 201);
}
