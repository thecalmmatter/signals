import { redirect } from "next/navigation";
import { getPool } from "@/lib/db";
import { getAdminUserId } from "@/lib/admin";
import { isBillingEnabled } from "@/lib/access";
import { ADMIN_COLUMNS, mapAdminRow } from "@/lib/signals-admin";
import { POSITION_COLUMNS, mapPositionRow } from "@/lib/positions-admin";
import AdminSignals from "@/components/admin-signals";
import AdminScanMappings from "@/components/admin-scan-mappings";
import AdminBilling from "@/components/admin-billing";
import AdminPositions from "@/components/admin-positions";
import AdminWaitlist from "@/components/admin-waitlist";
import { ActivityFeed } from "@/components/activity-feed";

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
      pool.query(
        "SELECT email, source, created_at, invited_at FROM waitlist_signups ORDER BY created_at DESC LIMIT 100"
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
      })),
    };
  } catch (error) {
    console.error("failed to load waitlist data (run scripts/migration_waitlist.sql?)", error);
    return { total: 0, bySource: [], recent: [] };
  }
}

// Positions ledger (scripts/migration_positions.sql) may not be applied yet —
// degrade to an empty panel instead of a hard 500 if so.
async function loadPositions() {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT ${POSITION_COLUMNS} FROM positions ORDER BY opened_at DESC, id DESC LIMIT 500`
    );
    return rows.map((r) => mapPositionRow(r));
  } catch (error) {
    console.error("failed to load positions data (run scripts/migration_positions.sql?)", error);
    return [];
  }
}

// Billing tables (scripts/migration_billing.sql) may not be applied on every
// environment yet — degrade to an empty panel instead of a hard 500 if so.
async function loadBilling() {
  try {
    const pool = getPool();
    const [usersRes, settingsRes] = await Promise.all([
      pool.query(
        `SELECT id, email, subscription_status, trial_ends_at, razorpay_subscription_id, created_at
           FROM users ORDER BY created_at DESC`
      ),
      pool.query("SELECT default_trial_ends_at FROM app_settings WHERE id = 1"),
    ]);
    return {
      users: usersRes.rows.map((r) => ({
        id: r.id,
        email: r.email,
        subscriptionStatus: r.subscription_status,
        trialEndsAt: r.trial_ends_at,
        razorpaySubscriptionId: r.razorpay_subscription_id,
        createdAt: r.created_at,
      })),
      defaultTrialEndsAt: settingsRes.rows[0]?.default_trial_ends_at ?? null,
    };
  } catch (error) {
    console.error("failed to load billing data (run scripts/migration_billing.sql?)", error);
    return { users: [], defaultTrialEndsAt: null };
  }
}

export default async function AdminPage() {
  const adminId = await getAdminUserId();
  if (!adminId) redirect("/dashboard");

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT ${ADMIN_COLUMNS} FROM signals ORDER BY updated_at DESC, id DESC LIMIT 200`
  );
  const { rows: scanRows } = await pool.query(
    "SELECT scan_url, scan_name, signal_type, active FROM scan_mappings ORDER BY scan_name, scan_url"
  );
  const scanMappings = scanRows.map((r) => ({
    scanUrl: r.scan_url,
    scanName: r.scan_name,
    signalType: r.signal_type,
    active: r.active,
  }));
  const billing = await loadBilling();
  const waitlist = await loadWaitlist();
  const positions = await loadPositions();

  return (
    <div className="flex flex-1 flex-col bg-zinc-950 text-zinc-100">
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10 md:py-14">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-50 md:text-3xl">
              Admin — signal controls
            </h1>
            <p className="mt-2 text-sm text-zinc-400">
              Suppress, edit, or hand-add signals. Actions are logged to
              signal_events and never undo a webhook&apos;s override decision.
            </p>
          </div>
          <a
            href="/dashboard"
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800"
          >
            ← Back to dashboard
          </a>
        </div>
        <AdminSignals signals={rows.map((r) => mapAdminRow(r))} />
        <div className="mt-8">
          <AdminScanMappings initial={scanMappings} />
        </div>
        <div className="mt-8">
          <ActivityFeed />
        </div>
        <div className="mt-8">
          <h2 className="mb-4 text-lg font-semibold tracking-tight text-zinc-50">
            Positions ledger
          </h2>
          <p className="mb-4 text-sm text-zinc-400">
            Track record of daily positions actually posted publicly — separate from
            the live signal feed above. This is the internal source of truth for a
            future win-rate / statistical-edge report.
          </p>
          <AdminPositions positions={positions} />
        </div>
        <div className="mt-8">
          <h2 className="mb-4 text-lg font-semibold tracking-tight text-zinc-50">
            Trial & billing
          </h2>
          {!isBillingEnabled() && (
            <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300">
              Billing is disabled sitewide (<code className="text-amber-200">BILLING_ENABLED=false</code>).
              Every signed-in user has full free access regardless of the trial
              dates and subscription statuses below — they&apos;re preserved but
              not enforced. Set <code className="text-amber-200">BILLING_ENABLED=true</code> (or remove
              the var) and redeploy to re-enable the paywall.
            </div>
          )}
          <AdminBilling initialUsers={billing.users} initialDefaultTrialEndsAt={billing.defaultTrialEndsAt} />
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