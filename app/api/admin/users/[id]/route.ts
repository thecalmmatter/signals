import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getAdminUserId } from "@/lib/admin";

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
    },
    200
  );
}
