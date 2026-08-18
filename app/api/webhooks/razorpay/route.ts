import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/razorpay";

// Razorpay webhook — PUBLIC by design, same pattern as the Chartlink/Clerk
// webhooks (proxy.ts does not gate this path). Auth is the signature header,
// verified against the raw body before any JSON parsing.

export const dynamic = "force-dynamic";

type RazorpayEvent = {
  event: string;
  payload?: {
    subscription?: {
      entity?: {
        id: string;
        status: string;
        notes?: Record<string, string>;
      };
    };
  };
};

// Authoritative status this app tracks vs the (many) Razorpay subscription
// states. Anything not explicitly "active" blocks access once the trial's
// over — see lib/access.ts.
const STATUS_BY_EVENT: Record<string, string> = {
  "subscription.activated": "active",
  "subscription.charged": "active",
  "subscription.completed": "cancelled",
  "subscription.cancelled": "cancelled",
  "subscription.expired": "cancelled",
  "subscription.halted": "halted",
  "subscription.pending": "pending",
};

export async function POST(req: Request) {
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  const rawBody = await req.text();

  let valid: boolean;
  try {
    valid = verifyWebhookSignature(rawBody, signature);
  } catch (error) {
    console.error("[razorpay webhook] signature check unavailable", error);
    return NextResponse.json({ error: "webhook not configured" }, { status: 500 });
  }
  if (!valid) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let event: RazorpayEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "unparseable payload" }, { status: 400 });
  }

  const subscription = event.payload?.subscription?.entity;
  const newStatus = STATUS_BY_EVENT[event.event];

  if (!subscription || !newStatus) {
    // Not an event we track (e.g. payment.* events) — ack so Razorpay
    // doesn't retry, just don't act on it.
    return NextResponse.json({ ok: true, ignored: event.event });
  }

  const pool = getPool();
  const userIdFromNotes = subscription.notes?.clerk_user_id ?? null;

  const result = await pool.query(
    `UPDATE users
        SET subscription_status = $1, updated_at = now()
      WHERE razorpay_subscription_id = $2`,
    [newStatus, subscription.id]
  );

  // Fallback: subscription id wasn't on the user row yet for some reason
  // (e.g. confirm() raced the webhook) — recover via the notes we set at
  // subscription creation time.
  if (result.rowCount === 0 && userIdFromNotes) {
    await pool.query(
      `UPDATE users
          SET subscription_status = $1, razorpay_subscription_id = $2, updated_at = now()
        WHERE id = $3`,
      [newStatus, subscription.id, userIdFromNotes]
    );
  }

  console.log(`[razorpay webhook] ${event.event} -> ${subscription.id} status=${newStatus}`);
  return NextResponse.json({ ok: true });
}
