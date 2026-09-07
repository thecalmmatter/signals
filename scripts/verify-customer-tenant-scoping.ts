// Automated smoke test for Phase 3's customer-facing tenant resolution
// (lib/tenants.ts resolveCustomerTenant/getTenantForCustomer) and for
// loadLiveSignals()'s tenant filtering when called with a real tenantId —
// the exact path GET /api/signals, /dashboard, and /dashboard/track-record
// now use to decide which tenant's signals a signed-in customer sees.
//
// DB-only, no Clerk session needed (resolveCustomerTenant() takes a plain
// userId string) — creates its own throwaway tenant + tenant_customers row
// + fake Clerk user id + test signal, then cleans up everything.
//
// What it proves:
//   1. A user with a tenant_customers row resolves to THAT tenant.
//   2. A user with no tenant_customers row resolves to the DEFAULT tenant
//      (not null — every existing single-operator-instance customer must
//      keep seeing exactly what they see today).
//   3. loadLiveSignals(testTenantId) returns the test tenant's signal;
//      loadLiveSignals(defaultTenantId) does not — proving the customer
//      dashboard's tenant filtering actually isolates, not just resolves
//      an id that's then ignored.
//
// Usage (run from the project root):
//   ./scripts/verify-customer-tenant-scoping.sh

import crypto from "node:crypto";
import { getPool } from "../lib/db";
import { getDefaultTenant, resolveCustomerTenant } from "../lib/tenants";
import { loadLiveSignals } from "../lib/live-signals";

async function main() {
  const pool = getPool();
  const suffix = crypto.randomBytes(4).toString("hex");
  const tenantSlug = `verify-cust-${suffix}`;
  const memberUserId = `user_verify_cust_${suffix}`;
  const strangerUserId = `user_verify_cust_stranger_${suffix}`;
  const symbol = `ZZVERIFYCUST${suffix}`.toUpperCase();

  let tenantId: number | null = null;
  let pass = true;
  const problems: string[] = [];

  try {
    const defaultTenant = await getDefaultTenant();
    console.log(`Default tenant id: ${defaultTenant.id}`);

    const tenantRes = await pool.query<{ id: string }>(
      `INSERT INTO tenants (slug, brand_name, status) VALUES ($1, $2, 'active') RETURNING id`,
      [tenantSlug, `Verify Customer ${suffix}`]
    );
    tenantId = Number(tenantRes.rows[0].id);
    console.log(`Created test tenant id=${tenantId}`);

    await pool.query(`INSERT INTO tenant_customers (user_id, tenant_id) VALUES ($1, $2)`, [
      memberUserId,
      tenantId,
    ]);
    console.log(`Made '${memberUserId}' a tenant_customers member of the test tenant\n`);

    // 1. A real membership resolves to the test tenant.
    const resolvedMember = await resolveCustomerTenant(memberUserId);
    if (resolvedMember.id !== tenantId) {
      pass = false;
      problems.push(`resolveCustomerTenant('${memberUserId}') returned id=${resolvedMember.id}, expected ${tenantId}`);
    } else {
      console.log(`✓ resolveCustomerTenant() correctly resolved the member to tenant id=${resolvedMember.id}`);
    }

    // 2. No membership row falls back to the DEFAULT tenant (not null) —
    //    every existing customer's behavior must stay unchanged.
    const resolvedStranger = await resolveCustomerTenant(strangerUserId);
    if (resolvedStranger.id !== defaultTenant.id) {
      pass = false;
      problems.push(
        `resolveCustomerTenant('${strangerUserId}') returned id=${resolvedStranger.id}, expected the default tenant's id=${defaultTenant.id}`
      );
    } else {
      console.log(`✓ resolveCustomerTenant() correctly fell back to the default tenant for a non-member\n`);
    }

    // 3. loadLiveSignals(tenantId) isolation — insert a test signal under
    //    the test tenant, confirm it shows up when queried with that
    //    tenant's id and does NOT show up when queried with the default
    //    tenant's id (the exact call GET /api/signals now makes for an
    //    existing customer).
    await pool.query(
      `INSERT INTO signals (tenant_id, symbol, name, signal_type, status, generated_at, updated_at, days_in)
       VALUES ($1, $2, $2, 'buy', 'active', now(), now(), 0)`,
      [tenantId, symbol]
    );

    const { signals: testTenantSignals } = await loadLiveSignals(tenantId);
    const { signals: defaultTenantSignals } = await loadLiveSignals(defaultTenant.id);

    if (!testTenantSignals.some((s) => s.symbol === symbol)) {
      pass = false;
      problems.push(`loadLiveSignals(testTenantId) did not include ${symbol}`);
    } else {
      console.log(`✓ loadLiveSignals(testTenantId) correctly includes ${symbol}`);
    }
    if (defaultTenantSignals.some((s) => s.symbol === symbol)) {
      pass = false;
      problems.push(`loadLiveSignals(defaultTenantId) leaked ${symbol} from the test tenant`);
    } else {
      console.log(`✓ loadLiveSignals(defaultTenantId) correctly excludes ${symbol}\n`);
    }
  } catch (err) {
    pass = false;
    problems.push(err instanceof Error ? err.message : String(err));
  } finally {
    console.log("Cleaning up test data...");
    await pool.query(`DELETE FROM signal_events WHERE symbol = $1`, [symbol]);
    await pool.query(`DELETE FROM signals WHERE symbol = $1`, [symbol]);
    await pool.query(`DELETE FROM tenant_customers WHERE user_id = ANY($1)`, [[memberUserId, strangerUserId]]);
    if (tenantId) await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
    console.log("Done.\n");
  }

  if (pass) {
    console.log("PASS — customer tenant resolution + data isolation verified.");
    process.exit(0);
  } else {
    console.log("FAIL:");
    for (const p of problems) console.log(`  - ${p}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
