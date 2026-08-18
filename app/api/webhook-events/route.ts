import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getAdminUserId } from "@/lib/admin";

// Live webhook activity feed. ADMIN ONLY — shows what Chartlink just sent
// (mapped → signal written, unmapped → skipped, malformed, etc.) so the owner
// can decide whether to map a scan. Non-admins get 403; it is never shown on
// the customer-facing dashboard.

export const dynamic = "force-dynamic";
export const revalidate = 0;

const json = (body: unknown, status: number) => NextResponse.json(body, { status });

function istDateTime(iso: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(iso);
}

function stocksFromPayload(raw: unknown): string[] {
  let parsed: Record<string, unknown> | null = null;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      parsed = null;
    }
  } else if (typeof raw === "object" && raw !== null) {
    parsed = raw as Record<string, unknown>;
  }
  if (!parsed) return [];
  return String(parsed.stocks ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function GET() {
  const adminId = await getAdminUserId();
  if (!adminId) return json({ error: "forbidden" }, 403);

  try {
    const { rows } = await getPool().query(
      `SELECT id, event_type, symbol, trigger_date, scan_name, scan_url, detail, raw_payload, created_at
         FROM signal_events
        ORDER BY id DESC
        LIMIT 40`
    );

    const events = rows.map((r) => ({
      id: r.id,
      eventType: r.event_type,
      symbol: r.symbol,
      stocks: stocksFromPayload(r.raw_payload),
      triggerDate: r.trigger_date,
      scanName: r.scan_name,
      scanUrl: r.scan_url,
      detail: r.detail,
      time: istDateTime(r.created_at),
    }));

    return json({ events, generatedAt: new Date().toISOString() }, 200);
  } catch (error) {
    console.error("GET /api/webhook-events failed", error);
    return json({ error: "failed to load events" }, 500);
  }
}

// Admin only: wipe the activity feed (signal_events log).
export async function DELETE() {
  const adminId = await getAdminUserId();
  if (!adminId) return json({ error: "forbidden" }, 403);

  try {
    const result = await getPool().query("DELETE FROM signal_events");
    return json({ deleted: result.rowCount ?? 0 }, 200);
  } catch (error) {
    console.error("DELETE /api/webhook-events failed", error);
    return json({ error: "failed to clear events" }, 500);
  }
}
