// Razorpay REST client — raw fetch + HMAC verification, no SDK dependency
// (same pattern as lib/fyers.ts and lib/llm). Docs:
// https://razorpay.com/docs/api/payments/subscriptions/

import { createHmac, timingSafeEqual } from "node:crypto";

const API_BASE = "https://api.razorpay.com/v1";

class RazorpayError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

function authHeader(): string {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new RazorpayError("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not configured");
  }
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

export type RazorpaySubscription = {
  id: string;
  status: string; // "created" | "authenticated" | "active" | "pending" | "halted" | "cancelled" | "completed" | "expired"
  plan_id: string;
  customer_id?: string;
  short_url?: string;
};

/**
 * Creates a Razorpay subscription for one plan/customer. `totalCount` is the
 * number of billing cycles Razorpay will run before stopping on its own —
 * set it generously (e.g. 120 monthly cycles = 10 years); cancelling early
 * is how a user actually stops paying, this isn't a hard commitment.
 */
export async function createSubscription(params: {
  planId: string;
  totalCount: number;
  notes?: Record<string, string>;
}): Promise<RazorpaySubscription> {
  const res = await fetch(`${API_BASE}/subscriptions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(),
    },
    body: JSON.stringify({
      plan_id: params.planId,
      customer_notify: 1,
      total_count: params.totalCount,
      notes: params.notes ?? {},
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new RazorpayError(`razorpay create subscription ${res.status}: ${detail.slice(0, 300)}`, res.status);
  }

  return (await res.json()) as RazorpaySubscription;
}

export async function fetchSubscription(id: string): Promise<RazorpaySubscription> {
  const res = await fetch(`${API_BASE}/subscriptions/${id}`, {
    headers: { Authorization: authHeader() },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new RazorpayError(`razorpay fetch subscription ${res.status}: ${detail.slice(0, 300)}`, res.status);
  }
  return (await res.json()) as RazorpaySubscription;
}

/**
 * Actually stops billing on Razorpay's side — flipping our local
 * subscription_status to "cancelled" alone doesn't touch the real
 * subscription, so it would keep renewing/charging until this is called too.
 * `cancelAtCycleEnd = false` cancels immediately (default); `true` lets the
 * current paid cycle run out first.
 */
export async function cancelSubscription(
  id: string,
  cancelAtCycleEnd = false
): Promise<RazorpaySubscription> {
  const res = await fetch(`${API_BASE}/subscriptions/${id}/cancel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(),
    },
    body: JSON.stringify({ cancel_at_cycle_end: cancelAtCycleEnd ? 1 : 0 }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new RazorpayError(`razorpay cancel subscription ${res.status}: ${detail.slice(0, 300)}`, res.status);
  }
  return (await res.json()) as RazorpaySubscription;
}

function hmacHex(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verifies the signature Razorpay Checkout hands back in its success
 * callback (`razorpay_payment_id`, `razorpay_subscription_id`,
 * `razorpay_signature`). This is a fast-path activation only — the webhook
 * is the authoritative source of truth, this just avoids a spinner while
 * the webhook lands.
 */
export function verifyPaymentSignature(params: {
  paymentId: string;
  subscriptionId: string;
  signature: string;
}): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) throw new RazorpayError("RAZORPAY_KEY_SECRET not configured");
  const expected = hmacHex(`${params.paymentId}|${params.subscriptionId}`, secret);
  return safeEqualHex(expected, params.signature);
}

/** Verifies the `X-Razorpay-Signature` header against the raw webhook body. */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new RazorpayError("RAZORPAY_WEBHOOK_SECRET not configured");
  const expected = hmacHex(rawBody, secret);
  return safeEqualHex(expected, signature);
}
