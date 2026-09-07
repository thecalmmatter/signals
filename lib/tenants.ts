// Multi-tenancy, phase 1 — tenant resolution helpers.
//
// See scripts/migration_tenants.sql for the schema and what is/isn't scoped
// yet. Every existing admin route and dashboard page today still runs
// against the single 'default' tenant via the legacy ADMIN_USER_IDS env
// allowlist (lib/admin.ts) — nothing here changes that behavior. This
// module is the plumbing new tenant-scoped code (starting with the
// chartlink webhook) uses, and what future per-tenant admin routes will
// migrate onto.

import { getPool } from "./db";

export const DEFAULT_TENANT_SLUG = "default";

export type Tenant = {
  id: number;
  slug: string;
  brandName: string;
  sebiRegName: string | null;
  sebiRegNumber: string | null;
  status: "active" | "suspended";
};

const TENANT_COLUMNS =
  "id, slug, brand_name, sebi_reg_name, sebi_reg_number, status";
const TENANT_COLUMNS_QUALIFIED =
  "t.id, t.slug, t.brand_name, t.sebi_reg_name, t.sebi_reg_number, t.status";

function mapTenantRow(row: Record<string, unknown>): Tenant {
  return {
    id: Number(row.id),
    slug: row.slug as string,
    brandName: row.brand_name as string,
    sebiRegName: (row.sebi_reg_name as string | null) ?? null,
    sebiRegNumber: (row.sebi_reg_number as string | null) ?? null,
    status: row.status as "active" | "suspended",
  };
}

let defaultTenantCache: Tenant | null = null;

/** The seeded 'default' tenant representing today's single-operator
 *  instance. Cached in-process — it's effectively static, and every
 *  request that hasn't been migrated to real tenant resolution yet needs
 *  this on the hot path. */
export async function getDefaultTenant(): Promise<Tenant> {
  if (defaultTenantCache) return defaultTenantCache;
  const { rows } = await getPool().query(
    `SELECT ${TENANT_COLUMNS} FROM tenants WHERE slug = $1`,
    [DEFAULT_TENANT_SLUG]
  );
  if (!rows[0]) {
    throw new Error(
      "getDefaultTenant: no 'default' tenant row — run scripts/migration_tenants.sql"
    );
  }
  defaultTenantCache = mapTenantRow(rows[0]);
  return defaultTenantCache;
}

/** Resolve a tenant by its Chartlink webhook token — used by the webhook
 *  route so each reseller can point their own Chartlink alerts at the same
 *  route with their own token, instead of sharing the operator's. Returns
 *  null for an unknown/blank token; callers should NOT fall back to the
 *  default tenant on a bad token (that would let one tenant's leaked token
 *  write into another's — or the operator's — signal feed). The single
 *  legacy CHARTLINK_WEBHOOK_TOKEN env var is handled separately by the
 *  caller as an explicit, intentional fallback for the default tenant only. */
export async function getTenantByWebhookToken(token: string): Promise<Tenant | null> {
  if (!token) return null;
  const { rows } = await getPool().query(
    `SELECT ${TENANT_COLUMNS} FROM tenants WHERE chartlink_webhook_token = $1 AND status = 'active'`,
    [token]
  );
  return rows[0] ? mapTenantRow(rows[0]) : null;
}

/** Which tenant (if any) a Clerk user id administers, via the tenant_admins
 *  join table. Returns null if the user isn't a tenant admin anywhere —
 *  callers migrating off the legacy ADMIN_USER_IDS allowlist (lib/admin.ts)
 *  should treat that as "not an admin of any tenant" and fall back to the
 *  existing global-allowlist check for backward compatibility during the
 *  transition, not as a hard denial. Used by lib/admin.ts's
 *  resolveAdminTenant() (Phase 2). */
export async function getTenantForAdminUser(userId: string): Promise<Tenant | null> {
  if (!userId) return null;
  const { rows } = await getPool().query(
    `SELECT ${TENANT_COLUMNS_QUALIFIED}
       FROM tenant_admins ta
       JOIN tenants t ON t.id = ta.tenant_id
      WHERE ta.user_id = $1 AND t.status = 'active'
      LIMIT 1`,
    [userId]
  );
  return rows[0] ? mapTenantRow(rows[0]) : null;
}

/** Which tenant (if any) a Clerk user id is a CUSTOMER of, via the
 *  tenant_customers table (scripts/migration_tenant_customers.sql) — a
 *  reseller's own subscriber, as opposed to getTenantForAdminUser() above
 *  (that tenant's admin). One row per user: a customer belongs to exactly
 *  one tenant, unlike tenant_admins which permits (in principle) the same
 *  user administering more than one. Returns null if the user has no
 *  explicit membership row, OR if the table doesn't exist yet on this
 *  environment (query error swallowed here, not propagated) — callers
 *  treat both the same way: "an existing single-operator-instance
 *  customer," falling back to the default tenant (see
 *  resolveCustomerTenant() below). That degrade-on-missing-migration
 *  behavior matters here specifically: unlike the admin/webhook tenant
 *  paths, this one sits on the customer-facing ticker's hot path
 *  (GET /api/signals, /dashboard, /dashboard/track-record) — an unhandled
 *  error here would 500 every signed-in customer's feed if this code ships
 *  even briefly before scripts/migration_tenant_customers.sql has run. */
export async function getTenantForCustomer(userId: string): Promise<Tenant | null> {
  if (!userId) return null;
  try {
    const { rows } = await getPool().query(
      `SELECT ${TENANT_COLUMNS_QUALIFIED}
         FROM tenant_customers tc
         JOIN tenants t ON t.id = tc.tenant_id
        WHERE tc.user_id = $1 AND t.status = 'active'`,
      [userId]
    );
    return rows[0] ? mapTenantRow(rows[0]) : null;
  } catch (error) {
    console.error(
      "getTenantForCustomer: query failed (run scripts/migration_tenant_customers.sql?) — falling back to default tenant",
      error
    );
    return null;
  }
}

/** Full tenant resolution for a signed-in customer (not an admin) — used by
 *  the customer-facing dashboard/track-record/signals routes. Unlike
 *  resolveAdminTenant() (lib/admin.ts), this never returns null: every
 *  existing customer today has no tenant_customers row and must keep
 *  seeing exactly what they see now, so a missing membership falls back to
 *  the 'default' tenant rather than denying access. A future reseller
 *  signup flow is what would actually populate tenant_customers for a real
 *  second tenant's subscribers — until then this always resolves to
 *  'default'. */
export async function resolveCustomerTenant(userId: string): Promise<Tenant> {
  const tenant = await getTenantForCustomer(userId);
  return tenant ?? getDefaultTenant();
}
