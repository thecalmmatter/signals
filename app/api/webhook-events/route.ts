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

function parsePayload(raw: unknown): Record<string, unknown> | null {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object" && raw !== null) return raw as Record<string, unknown>;
  return null;
}

function stocksFromPayload(raw: unknown): string[] {
  const parsed = parsePayload(raw);
  if (!parsed) return [];
  return String(parsed.stocks ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Pairs each stock with its trigger price by index (same rule the Chartlink
// route itself uses) so an "Add" button in the UI can prefill both symbol
// and entry price. Returns price: null per item if trigger_prices is
// missing or its length doesn't line up with stocks — never guesses.
function symbolPricePairs(raw: unknown): { symbol: string; price: number | null }[] {
  const parsed = parsePayload(raw);
  if (!parsed) return [];
  const symbols = String(parsed.stocks ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const rawPrices = String(parsed.trigger_prices ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const prices = rawPrices.map((p) => {
    const n = Number(p);
    return Number.isFinite(n) ? n : null;
  });
  const pricesAlign = prices.length === symbols.length;
  return symbols.map((symbol, i) => ({ symbol, price: pricesAlign ? prices[i] : null }));
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
      // Only meaningful for unmapped_scan (no signal_type => nothing was
      // written yet) — this is what lets the feed offer an "Add" shortcut
      // straight into the manual-add form.
      items: r.event_type === "unmapped_scan" ? symbolPricePairs(r.raw_payload) : [],
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
