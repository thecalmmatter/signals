import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getAdminUserId } from "@/lib/admin";

export const dynamic = "force-dynamic";

const json = (body: unknown, status: number) => NextResponse.json(body, { status });

function mapRow(r: Record<string, unknown>) {
  return {
    scanUrl: String(r.scan_url),
    scanName: (r.scan_name as string) ?? null,
    signalType: r.signal_type as "buy" | "sell",
    active: Boolean(r.active),
  };
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ scanUrl: string }> }
) {
  const adminId = await getAdminUserId();
  if (!adminId) return json({ error: "forbidden" }, 403);

  const scanUrl = decodeURIComponent((await ctx.params).scanUrl);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  if (body.signalType !== undefined) {
    const t = String(body.signalType).trim().toLowerCase();
    if (t !== "buy" && t !== "sell") return json({ error: "signalType must be 'buy' or 'sell'" }, 400);
  }

  const sets: string[] = ["updated_at = now()"];
  const vals: unknown[] = [];
  const P = (v: unknown) => {
    vals.push(v);
    return `$${vals.length}`;
  };
  if (body.scanName !== undefined) {
    const v = body.scanName === null ? null : String(body.scanName).trim();
    sets.unshift(`scan_name = ${P(v)}`);
  }
  if (body.signalType !== undefined) sets.unshift(`signal_type = ${P(String(body.signalType).trim().toLowerCase())}`);
  if (body.active !== undefined) sets.unshift(`active = ${P(Boolean(body.active))}`);

  const updated = await getPool().query(
    `UPDATE scan_mappings SET ${sets.join(", ")} WHERE scan_url = ${P(scanUrl)}
     RETURNING scan_url, scan_name, signal_type, active`,
    vals
  );
  if (!updated.rows[0]) return json({ error: "not found" }, 404);
  return json({ mapping: mapRow(updated.rows[0]) }, 200);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ scanUrl: string }> }) {
  const adminId = await getAdminUserId();
  if (!adminId) return json({ error: "forbidden" }, 403);

  const scanUrl = decodeURIComponent((await ctx.params).scanUrl);
  const res = await getPool().query("DELETE FROM scan_mappings WHERE scan_url = $1", [scanUrl]);
  if (!res.rowCount) return json({ error: "not found" }, 404);
  return json({ ok: true, scanUrl }, 200);
}