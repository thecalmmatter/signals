import { NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/admin";
import { refreshAllStockAnalytics, refreshStockAnalytics } from "@/lib/stock-analytics-cache";

export const dynamic = "force-dynamic";

const json = (body: unknown, status: number) => NextResponse.json(body, { status });

// Trigger the Indian API fetch for one symbol ({ symbol }) or every
// currently-active symbol ({ all: true }) and persist the result to
// stock_analytics_cache — the "Refresh" / "Refresh all" admin buttons.
export async function POST(req: Request) {
  const adminId = await getAdminUserId();
  if (!adminId) return json({ error: "forbidden" }, 403);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  if (body.all === true) {
    const results = await refreshAllStockAnalytics();
    return json({ results }, 200);
  }

  const symbol = String(body.symbol ?? "").trim().toUpperCase();
  if (!symbol) return json({ error: "symbol or all:true is required" }, 400);

  const result = await refreshStockAnalytics(symbol);
  return json({ symbol, ...result }, result.ok ? 200 : 502);
}
