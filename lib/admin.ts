import { auth } from "@clerk/nextjs/server";
import { getDefaultTenant, getTenantForAdminUser, type Tenant } from "./tenants";

const ADMIN_IDS = new Set(
  (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

export type AdminContext = { userId: string; tenant: Tenant };

/**
 * Pure DB-level admin→tenant resolution — no Clerk, so this is directly
 * testable (see scripts/verify-admin-tenant-scoping.ts). Tries the real
 * tenant_admins path first (a reseller's own admin, Phase 2), then falls
 * back to the legacy global ADMIN_USER_IDS allowlist scoped to the
 * 'default' tenant — exactly the access every admin route has had until
 * now. Returns null if neither matches (not an admin of anything).
 */
export async function resolveAdminTenant(userId: string): Promise<Tenant | null> {
  if (!userId) return null;
  const tenant = await getTenantForAdminUser(userId);
  if (tenant) return tenant;
  return ADMIN_IDS.has(userId) ? getDefaultTenant() : null;
}

/**
 * Full admin context (Clerk userId + resolved tenant) for the current
 * request. Use this — not getAdminUserId() — in any admin page/route that
 * reads or writes tenant-scoped data (signals, positions), so a reseller's
 * admin only ever sees/touches their own tenant's rows.
 */
export async function getAdminContext(): Promise<AdminContext | null> {
  const { userId } = await auth();
  if (!userId) return null;
  const tenant = await resolveAdminTenant(userId);
  return tenant ? { userId, tenant } : null;
}

/**
 * Returns the current signed-in user's Clerk id IF they administer some
 * tenant (a real tenant_admins row, or the legacy global allowlist),
 * otherwise null. Kept for admin surfaces that only gate access without
 * needing to scope data by tenant yet (billing, user management, broker,
 * scan mappings — see README §13 for what's still global on purpose).
 */
export async function getAdminUserId(): Promise<string | null> {
  const ctx = await getAdminContext();
  return ctx?.userId ?? null;
}

/** Sync, no-auth-lookup check — for tagging *other* users' rows (e.g. in the
 *  user management table) against the legacy global ADMIN_USER_IDS list.
 *  Deliberately does NOT check tenant_admins: this backs the operator's own
 *  global user-management page, not a tenant-scoped admin check. */
export function isAdminUserId(id: string): boolean {
  return ADMIN_IDS.has(id);
}
