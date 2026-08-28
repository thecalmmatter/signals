import { redirect } from "next/navigation";
import { clerkClient } from "@clerk/nextjs/server";
import { getPool } from "@/lib/db";
import { getAdminUserId, isAdminUserId } from "@/lib/admin";
import { isBillingEnabled } from "@/lib/access";
import AdminBilling from "@/components/admin-billing";
import AdminWaitlist from "@/components/admin-waitlist";

export const dynamic = "force-dynamic";

// Waitlist table (scripts/migration_waitlist.sql) may not be applied yet —
// degrade to an empty panel instead of a hard 500 if so.
async function loadWaitlist() {
  try {
    const pool = getPool();
    const [totalRes, bySourceRes, recentRes] = await Promise.all([
      pool.query("SELECT count(*)::int AS total FROM waitlist_signups"),
      pool.query(
        `SELECT coalesce(source, '(none)') AS source, count(*)::int AS total
           FROM waitlist_signups
          GROUP BY source
          ORDER BY total DESC`
      ),
      // blocked_at (scripts/migration_waitlist_block.sql) may not be applied
      // yet on every environment — fall back to the query without it rather
      // than losing the whole waitlist section over one missing column.
      pool
        .query(
          "SELECT email, source, created_at, invited_at, blocked_at FROM waitlist_signups ORDER BY created_at DESC LIMIT 100"
        )
        .catch(() =>
          pool.query(
            "SELECT email, source, created_at, invited_at FROM waitlist_signups ORDER BY created_at DESC LIMIT 100"
          )
        ),
    ]);
    return {
      total: totalRes.rows[0]?.total ?? 0,
      bySource: bySourceRes.rows.map((r) => ({ source: r.source as string, total: r.total as number })),
      recent: recentRes.rows.map((r) => ({
        email: r.email as string,
        source: r.source as string | null,
        createdAt: r.created_at as string,
        invitedAt: (r.invited_at as string | null) ?? null,
        blockedAt: (r.blocked_at as string | null | undefined) ?? null,
      })),
    };
  } catch (error) {
    console.error("failed to load waitlist data (run scripts/migration_waitlist.sql?)", error);
    return { total: 0, bySource: [], recent: [] };
  }
}

// Our local `users` row only gets created by the Clerk webhook (on
// user.created) or lazily when someone actually opens /dashboard (see
// lib/users.ts) — so someone who accepted an invite but hasn't visited the
// app yet, or landed while the webhook was misconfigured, would silently
// never show up here even though they're a real, signed-up Clerk user.
// Fetch Clerk's own user list and use it as "who actually exists"; the
// local row (if any) only supplies the billing/trial fields on top.
async function loadClerkUsers(): Promise<
  { id: string; email: string; firstName: string | null; lastName: string | null; createdAt: string }[] | null
> {
  try {
    const client = await clerkClient();
    const { data } = await client.users.getUserList({ limit: 500, orderBy: "-created_at" });
    return data.map((u) => {
      const primary = u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId) ?? u.emailAddresses[0];
      return {
        id: u.id,
        email: primary?.emailAddress ?? "",
        firstName: u.firstName,
        lastName: u.lastName,
        createdAt: new Date(u.createdAt).toISOString(),
      };
    });
  } catch (error) {
    console.error("failed to load Clerk user list — falling back to local users table only", error);
    return null;
  }
}

// Billing tables (scripts/migration_billing.sql) may not be applied on every
// environment yet — degrade to an empty panel instead of a hard 500 if so.
async function loadBilling() {
  const clerkUsers = await loadClerkUsers();

  try {
    const pool = getPool();
    const [usersRes, settingsRes] = await Promise.all([
      pool.query(
        `SELECT id, email, first_name, last_name, subscription_status, trial_ends_at,
                razorpay_subscription_id, created_at
           FROM users ORDER BY created_at DESC`
      ),
      pool.query("SELECT default_trial_ends_at FROM app_settings WHERE id = 1"),
    ]);

    const localById = new Map(usersRes.rows.map((r) => [r.id as string, r]));

    const users = clerkUsers
      ? clerkUsers.map((cu) => {
          const local = localById.get(cu.id);
          return {
            id: cu.id,
            email: (local?.email as string | undefined) ?? cu.email,
            firstName: (local?.first_name as string | null | undefined) ?? cu.firstName,
            lastName: (local?.last_name as string | null | undefined) ?? cu.lastName,
            isAdmin: isAdminUserId(cu.id),
            subscriptionStatus: (local?.subscription_status as string | undefined) ?? "none",
            trialEndsAt: (local?.trial_ends_at as string | null | undefined) ?? null,
            razorpaySubscriptionId: (local?.razorpay_subscription_id as string | null | undefined) ?? null,
            createdAt: (local?.created_at as string | undefined) ?? cu.createdAt,
          };
        })
      : // Clerk API unreachable (rare) — better to show the local-only view
        // than an empty table.
        usersRes.rows.map((r) => ({
          id: r.id as string,
          email: r.email as string,
          firstName: r.first_name as string | null,
          lastName: r.last_name as string | null,
          isAdmin: isAdminUserId(r.id as string),
          subscriptionStatus: r.subscription_status as string,
          trialEndsAt: r.trial_ends_at as string | null,
          razorpaySubscriptionId: r.razorpay_subscription_id as string | null,
          createdAt: r.created_at as string,
        }));

    return {
      users,
      defaultTrialEndsAt: settingsRes.rows[0]?.default_trial_ends_at ?? null,
      clerkUnavailable: clerkUsers === null,
    };
  } catch (error) {
    console.error("failed to load billing data (run scripts/migration_billing.sql?)", error);
    return { users: [], defaultTrialEndsAt: null, clerkUnavailable: clerkUsers === null };
  }
}

export default async function AdminUsersPage() {
  const adminId = await getAdminUserId();
  if (!adminId) redirect("/dashboard");

  const billing = await loadBilling();
  const waitlist = await loadWaitlist();

  return (
    <div className="flex flex-1 flex-col bg-zinc-950 text-zinc-100">
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10 md:py-14">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-50 md:text-3xl">
              User management
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">
              Everyone with dashboard access — trial/subscription status per
              user — plus everyone waiting for access. Separate from signal
              controls so this doesn&apos;t get lost scrolling the main admin
              panel as the user base grows.
            </p>
          </div>
          <a
            href="/dashboard/admin"
            className="shrink-0 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800"
          >
            ← Back to admin
          </a>
        </div>

        <div>
          <h2 className="mb-4 text-lg font-semibold tracking-tight text-zinc-50">
            Trial & billing
          </h2>
          {billing.clerkUnavailable && (
            <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300">
              Couldn&apos;t reach Clerk to pull the full signed-up user list — showing only
              users already synced to the local database. Someone who accepted an invite but
              hasn&apos;t opened the dashboard yet may not appear until Clerk is reachable again.
            </div>
          )}
          {!isBillingEnabled() && (
            <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300">
              Billing is disabled sitewide (<code className="text-amber-200">BILLING_ENABLED=false</code>).
              Every signed-in user has full free access regardless of the trial
              dates and subscription statuses below — they&apos;re preserved but
              not enforced. Set <code className="text-amber-200">BILLING_ENABLED=true</code> (or remove
              the var) and redeploy to re-enable the paywall.
            </div>
          )}
          <AdminBilling
            initialUsers={billing.users}
            initialDefaultTrialEndsAt={billing.defaultTrialEndsAt}
            currentAdminId={adminId}
            billingEnabled={isBillingEnabled()}
          />
        </div>

        <div className="mt-8">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Waitlist</h2>
            <span className="text-sm text-zinc-500">{waitlist.total} signup{waitlist.total === 1 ? "" : "s"}</span>
          </div>
          <p className="mb-4 text-sm text-zinc-400">
            Joining the waitlist is just an interest signal — it does not grant
            dashboard access on its own. Click <strong className="text-zinc-300">Invite</strong> to
            send a real Clerk invitation once you&apos;ve set the Clerk app&apos;s
            Access mode to Invite-only (see README §7).
          </p>

          {waitlist.bySource.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {waitlist.bySource.map((s) => (
                <span
                  key={s.source}
                  className="rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-300"
                >
                  {s.source} <span className="text-zinc-500">· {s.total}</span>
                </span>
              ))}
            </div>
          )}

          <AdminWaitlist rows={waitlist.recent} />
        </div>
      </main>
    </div>
  );
}
