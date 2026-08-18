import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getAdminUserId } from "@/lib/admin";

// Admin-only CRUD for scan_mappings (the Chartlink scan -> direction map).
// Not Clerk-gated by proxy.ts; the explicit admin guard 403s everyone else.

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

export async function GET() {
  const adminId = await getAdminUserId();
  if (!adminId) return json({ error: "forbidden" }, 403);

  const { rows } = await getPool().query(
    "SELECT scan_url, scan_name, signal_type, active FROM scan_mappings ORDER BY scan_name, scan_url"
  );
  return json({ mappings: rows.map(mapRow) }, 200);
}

export async function POST(req: Request) {
  const adminId = await getAdminUserId();
  if (!adminId) return json({ error: "forbidden" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const scanUrl = String(body.scanUrl ?? "").trim();
  const scanName = body.scanName === undefined || body.scanName === null ? null : String(body.scanName).trim();
  const signalType = String(body.signalType ?? "").trim().toLowerCase();
  const active = body.active === undefined ? true : Boolean(body.active);

  if (!scanUrl) return json({ error: "scanUrl is required" }, 400);
  if (signalType !== "buy" && signalType !== "sell") {
    return json({ error: "signalType must be 'buy' or 'sell'" }, 400);
  }

  const inserted = await getPool().query(
    `INSERT INTO scan_mappings (scan_url, scan_name, signal_type, active, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (scan_url) DO UPDATE SET
       scan_name  = EXCLUDED.scan_name,
       signal_type = EXCLUDED.signal_type,
       active     = EXCLUDED.active,
       updated_at = now()
     RETURNING scan_url, scan_name, signal_type, active`,
    [scanUrl, scanName || null, signalType, active]
  );
  return json({ mapping: mapRow(inserted.rows[0]) }, 201);
}