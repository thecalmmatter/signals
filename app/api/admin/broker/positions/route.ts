import { NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/admin";
import { getPositions, getFunds, FyersOrderError } from "@/lib/fyers-orders";

export const dynamic = "force-dynamic";

const json = (body: unknown, status: number) => NextResponse.json(body, { status });

// Admin-only: live positions + funds straight from Fyers (your account, not
// a per-user broker connection). Degrades to a structured error instead of
// a hard 500 — the daily-expiring FYERS_ACCESS_TOKEN means this call fails
// predictably once a day until refreshed.
export async function GET() {
  const adminId = await getAdminUserId();
  if (!adminId) return json({ error: "forbidden" }, 403);

  try {
    const [positions, funds] = await Promise.allSettled([getPositions(), getFunds()]);

    if (positions.status === "rejected") {
      const err = positions.reason;
      const message = err instanceof FyersOrderError ? err.message : "Fyers request failed";
      return json({ positions: [], openCount: 0, totalPl: 0, funds: null, error: message }, 200);
    }

    return json(
      {
        ...positions.value,
        funds: funds.status === "fulfilled" ? funds.value : null,
        error: null,
      },
      200
    );
  } catch (error) {
    console.error("GET /api/admin/broker/positions failed", error);
    return json({ positions: [], openCount: 0, totalPl: 0, funds: null, error: "unexpected error" }, 200);
  }
}
