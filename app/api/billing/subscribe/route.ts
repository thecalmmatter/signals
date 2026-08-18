import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getPool } from "@/lib/db";
import { createSubscription, fetchSubscription } from "@/lib/razorpay";

export const dynamic = "force-dynamic";

const json = (body: unknown, status: number) => NextResponse.json(body, { status });

// Subscription statuses that are still usable for checkout (not yet paid,
// but not dead either) — reuse rather than creating a fresh one each visit.
const REUSABLE = new Set(["created", "pending", "authenticated"]);
const BILLING_CYCLES = 120; // ~10 years of monthly cycles; cancelling is what actually stops billing

export async function POST() {
  const { userId } = await auth();
  if (!userId) return json({ error: "unauthorized" }, 401);

  const planId = process.env.RAZORPAY_PLAN_ID;
  if (!planId) return json({ error: "RAZORPAY_PLAN_ID not configured" }, 500);

  const pool = getPool();
  const { rows } = await pool.query<{ razorpay_subscription_id: string | null }>(
    "SELECT razorpay_subscription_id FROM users WHERE id = $1",
    [userId]
  );
  const existingId = rows[0]?.razorpay_subscription_id ?? null;

  try {
    if (existingId) {
      const existing = await fetchSubscription(existingId);
      if (existing.status === "active") {
        return json({ subscriptionId: existing.id, status: "active" }, 200);
      }
      if (REUSABLE.has(existing.status)) {
        return json({ subscriptionId: existing.id, status: existing.status }, 200);
      }
      // dead (cancelled/expired/halted) — fall through and create a new one
    }

    const user = await currentUser();
    const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress;

    const created = await createSubscription({
      planId,
      totalCount: BILLING_CYCLES,
      notes: { clerk_user_id: userId },
    });

    await pool.query(
      `UPDATE users SET razorpay_subscription_id = $1, updated_at = now() WHERE id = $2`,
      [created.id, userId]
    );

    return json({ subscriptionId: created.id, status: created.status, email }, 200);
  } catch (error) {
    console.error(`POST /api/billing/subscribe failed for ${userId}`, error);
    const detail = error instanceof Error ? error.message : String(error);
    return json({ error: "failed to start subscription", detail }, 502);
  }
}
