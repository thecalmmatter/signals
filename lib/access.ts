// Trial/subscription gate. Every signed-in user gets full access until their
// "dry run" ends — see scripts/migration_billing.sql for the model. Admins
// (ADMIN_USER_IDS) always pass, regardless of trial or subscription state,
// so the owner can never lock themselves out.
//
// BILLING_ENABLED is a sitewide kill switch, separate from the trial-date
// model above: set it to "false" to give every signed-in user full access
// unconditionally (e.g. during a free public dry-run before RIA
// registration), without touching per-user trial dates or the Razorpay flow
// underneath — flip it back to "true" (or unset it) later and everything
// resumes exactly where the trial/subscription config already had it.

import { getPool } from "@/lib/db";
import { getAdminUserId } from "@/lib/admin";

export type AccessStatus = {
  allowed: boolean;
  reason: "admin" | "subscribed" | "trial" | "expired" | "disabled";
  subscriptionStatus: string;
  trialEndsAt: string | null;
};

export function isBillingEnabled(): boolean {
  return process.env.BILLING_ENABLED !== "false";
}

export async function getAccessStatus(userId: string): Promise<AccessStatus> {
  const adminId = await getAdminUserId();
  if (adminId === userId) {
    return { allowed: true, reason: "admin", subscriptionStatus: "admin", trialEndsAt: null };
  }

  if (!isBillingEnabled()) {
    return { allowed: true, reason: "disabled", subscriptionStatus: "none", trialEndsAt: null };
  }

  const pool = getPool();
  let userRes: { rows: { subscription_status: string; trial_ends_at: string | null }[] };
  let settingsRes: { rows: { default_trial_ends_at: string | null }[] };
  try {
    [userRes, settingsRes] = await Promise.all([
      pool.query<{ subscription_status: string; trial_ends_at: string | null }>(
        "SELECT subscription_status, trial_ends_at FROM users WHERE id = $1",
        [userId]
      ),
      pool.query<{ default_trial_ends_at: string | null }>(
        "SELECT default_trial_ends_at FROM app_settings WHERE id = 1"
      ),
    ]);
  } catch (error) {
    // Billing migration not applied yet (missing columns/table) — fail open
    // rather than break the whole dashboard. Run scripts/migration_billing.sql.
    console.error("getAccessStatus query failed — is migration_billing.sql applied?", error);
    return { allowed: true, reason: "trial", subscriptionStatus: "none", trialEndsAt: null };
  }

  const user = userRes.rows[0];
  const subscriptionStatus = user?.subscription_status ?? "none";

  if (subscriptionStatus === "active") {
    return { allowed: true, reason: "subscribed", subscriptionStatus, trialEndsAt: null };
  }

  const effectiveTrialEnd = user?.trial_ends_at ?? settingsRes.rows[0]?.default_trial_ends_at ?? null;

  // No cutoff set anywhere = nobody's blocked yet (admin hasn't configured a
  // trial window). This keeps the app fully usable until billing is turned on.
  const allowed = effectiveTrialEnd === null || new Date(effectiveTrialEnd).getTime() > Date.now();

  return {
    allowed,
    reason: allowed ? "trial" : "expired",
    subscriptionStatus,
    trialEndsAt: effectiveTrialEnd,
  };
}
