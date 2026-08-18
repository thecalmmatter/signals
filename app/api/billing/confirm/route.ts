import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getPool } from "@/lib/db";
import { verifyPaymentSignature } from "@/lib/razorpay";

export const dynamic = "force-dynamic";

const json = (body: unknown, status: number) => NextResponse.json(body, { status });

// Fast-path activation right after Razorpay Checkout's success callback, so
// the user doesn't sit staring at a spinner waiting for the webhook. The
// webhook (app/api/webhooks/razorpay) is still the authoritative source of
// truth and will reconcile status independently either way.
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return json({ error: "unauthorized" }, 401);

  let body: { paymentId?: string; subscriptionId?: string; signature?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const { paymentId, subscriptionId, signature } = body;
  if (!paymentId || !subscriptionId || !signature) {
    return json({ error: "paymentId, subscriptionId and signature are required" }, 400);
  }

  const pool = getPool();

  // Only let a user confirm the subscription that's actually theirs.
  const { rows } = await pool.query<{ razorpay_subscription_id: string | null }>(
    "SELECT razorpay_subscription_id FROM users WHERE id = $1",
    [userId]
  );
  if (rows[0]?.razorpay_subscription_id !== subscriptionId) {
    return json({ error: "subscription does not belong to this user" }, 403);
  }

  let valid: boolean;
  try {
    valid = verifyPaymentSignature({ paymentId, subscriptionId, signature });
  } catch (error) {
    console.error("verifyPaymentSignature failed", error);
    return json({ error: "signature verification unavailable" }, 500);
  }

  if (!valid) return json({ error: "invalid signature" }, 400);

  await pool.query(
    `UPDATE users SET subscription_status = 'active', updated_at = now() WHERE id = $1`,
    [userId]
  );

  return json({ ok: true }, 200);
}
