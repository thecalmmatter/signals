import { NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/admin";
import { isIndianStockApiConfigured } from "@/lib/indian-stock-api";
import { listStockAnalyticsStatus } from "@/lib/stock-analytics-cache";

export const dynamic = "force-dynamic";

const json = (body: unknown, status: number) => NextResponse.json(body, { status });

// Status of the analytics-pane data pipeline, one row per currently-active
// symbol (admin only). Backs the "Stock analytics" panel's table.
export async function GET() {
  const adminId = await getAdminUserId();
  if (!adminId) return json({ error: "forbidden" }, 403);

  const statuses = await listStockAnalyticsStatus();
  return json({ configured: isIndianStockApiConfigured(), statuses }, 200);
}
