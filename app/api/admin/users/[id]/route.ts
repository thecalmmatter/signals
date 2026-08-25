import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { getPool } from "@/lib/db";
import { getAdminUserId } from "@/lib/admin";
import { cancelSubscription } from "@/lib/razorpay";

export const dynamic = "force-dynamic";

const json = (body: unknown, status: number) => NextResponse.json(body, { status });

// Per-user dry-run override. Pass trialEndsAt: null to clear it (falls back
// to app_settings.default_trial_ends_at). Also lets admin hand-flip
// subscription_status for comped/manual accounts, bypassing Razorpay.
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const adminId = await getAdminUserId();
  if (!adminId) return json({ error: "forbidden" }, 403);

  const { id } = await ctx.params;

  let body: { trialEndsAt?: string | null; subscriptionStatus?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const sets: string[] = [];
  const vals: unknown[] = [];
  const P = (v: unknown) => {
    vals.push(v);
    return `$${vals.length}`;
  };

  if ("trialEndsAt" in body) {
    if (body.trialEndsAt !== null && body.trialEndsAt !== undefined) {
      if (Number.isNaN(new Date(body.trialEndsAt).getTime())) {
        return json({ error: "invalid trialEndsAt" }, 400);
      }
    }
    sets.push(`trial_ends_at = ${P(body.trialEndsAt ?? null)}`);
  }

  if (body.subscriptionStatus !== undefined) {
    sets.push(`subscription_status = ${P(String(body.subscriptionStatus))}`);
  }

  if (sets.length === 0) return json({ error: "nothing to update" }, 400);

  // Setting status to "cancelled" from here should actually stop billing on
  // Razorpay's side — otherwise the next renewal webhook silently flips
  // subscription_status back to "active" underneath the admin's override.
  // Best-effort: report a warning back but don't block the local update on
  // it (an admin comping/uncomping a user shouldn't hard-fail on Razorpay
  // being briefly unreachable).
  let razorpayWarning: string | null = null;
  if (body.subscriptionStatus === "cancelled") {
    const existing = await getPool().query<{ razorpay_subscription_id: string | null }>(
      `SELECT razorpay_subscription_id FROM users WHERE id = $1`,
      [id]
    );
    const subId = existing.rows[0]?.razorpay_subscription_id;
    if (subId) {
      try {
        await cancelSubscription(subId);
      } catch (error) {
        console.error(`PATCH /api/admin/users/${id}: Razorpay cancel failed`, error);
        razorpayWarning =
          "Local status set to cancelled, but the live Razorpay subscription could not be cancelled — " +
          (error instanceof Error ? error.message : "unknown error") +
          ". It may keep renewing until cancelled directly in Razorpay.";
      }
    }
  }

  sets.push("updated_at = now()");

  const result = await getPool().query(
    `UPDATE users SET ${sets.join(", ")} WHERE id = ${P(id)}
     RETURNING id, email, subscription_status, trial_ends_at`,
    vals
  );

  if (!result.rows[0]) return json({ error: "not found" }, 404);

  const row = result.rows[0] as {
    id: string;
    email: string;
    subscription_status: string;
    trial_ends_at: string | null;
  };

  return json(
    {
      user: {
        id: row.id,
        email: row.email,
        subscriptionStatus: row.subscription_status,
        trialEndsAt: row.trial_ends_at,
      },
      razorpayWarning,
    },
    200
  );
}

// Fully removes a user: cancels any live Razorpay subscription (best
// effort), revokes their actual Clerk account (the real access control —
// deleting only the local row would leave them still able to sign in), then
// drops the local users row. A Clerk id 404 (already gone on Clerk's side)
// is treated as success so the local row can still be cleaned up; any other
// Clerk failure aborts before touching local data, so the table never shows
// "deleted" for someone who still has full access.
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const adminId = await getAdminUserId();
  if (!adminId) return json({ error: "forbidden" }, 403);

  const { id } = await ctx.params;
  if (id === adminId) return json({ error: "cannot delete your own admin account" }, 400);

  const existing = await getPool().query<{ razorpay_subscription_id: string | null }>(
    `SELECT razorpay_subscription_id FROM users WHERE id = $1`,
    [id]
  );
  const subId = existing.rows[0]?.razorpay_subscription_id;
  if (subId) {
    try {
      await cancelSubscription(subId);
    } catch (error) {
      console.error(`DELETE /api/admin/users/${id}: Razorpay cancel failed (continuing)`, error);
    }
  }

  try {
    const client = await clerkClient();
    await client.users.deleteUser(id);
  } catch (error) {
    const status = (error as { status?: number } | null)?.status;
    if (status !== 404) {
      console.error(`DELETE /api/admin/users/${id}: Clerk delete failed`, error);
      const message = error instanceof Error ? error.message : "Clerk delete failed";
      return json({ error: `failed to revoke Clerk access — user was not deleted: ${message}` }, 502);
    }
    // 404: no such Clerk user (already removed) — fine to clean up locally.
  }

  await getPool().query(`DELETE FROM users WHERE id = $1`, [id]);

  return json({ ok: true }, 200);
}
