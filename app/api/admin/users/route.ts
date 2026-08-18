import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getAdminUserId } from "@/lib/admin";

export const dynamic = "force-dynamic";

const json = (body: unknown, status: number) => NextResponse.json(body, { status });

export async function GET() {
  const adminId = await getAdminUserId();
  if (!adminId) return json({ error: "forbidden" }, 403);

  const { rows } = await getPool().query(
    `SELECT id, email, subscription_status, trial_ends_at, razorpay_subscription_id, created_at
       FROM users
      ORDER BY created_at DESC`
  );

  const users = rows.map((r) => ({
    id: r.id,
    email: r.email,
    subscriptionStatus: r.subscription_status,
    trialEndsAt: r.trial_ends_at,
    razorpaySubscriptionId: r.razorpay_subscription_id,
    createdAt: r.created_at,
  }));

  return json({ users }, 200);
}
