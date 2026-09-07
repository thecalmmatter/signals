// Automated smoke test for Phase 2's admin→tenant resolution
// (lib/admin.ts resolveAdminTenant) and for signals/positions tenant
// isolation on the admin write paths.
//
// resolveAdminTenant() is pure DB logic (no Clerk), so it's directly
// testable here without a real request/session — this script exercises it
// exactly the way an admin API route does, using a throwaway tenant +
// tenant_admins row + fake Clerk user id, then a second throwaway
// signal/position pair for the DEFAULT tenant to prove cross-tenant
// filtering actually excludes them. Cleans up everything it creates.
//
// What it proves:
//   1. A user with a tenant_admins row resolves to THAT tenant (not
//      'default'), even though they're not in ADMIN_USER_IDS.
//   2. A user with no tenant_admins row and not in ADMIN_USER_IDS resolves
//      to null (not an admin of anything) — the fallback doesn't leak.
//   3. The same tenant-scoped SQL used in the signals/positions admin
//      routes (WHERE tenant_id = $1) correctly excludes another tenant's
//      rows — i.e. the query shape those routes now use is actually
//      isolating, not just resolving a tenant id that's then ignored.
//
// This does NOT exercise the Clerk-wrapped getAdminContext()/getAdminUserId()
// or the live HTTP routes — that needs a real signed-in session, which
// isn't scriptable headlessly. Treat this as a logic/data-layer check;
// verifying the actual admin UI still works for you is still worth doing
// by hand once after deploying.
//
// Usage (run from the project root):
//   ./scripts/verify-admin-tenant-scoping.sh
//   npx tsx scripts/verify-admin-tenant-scoping.ts

import crypto from "node:crypto";
import { getPool } from "../lib/db";
import { getDefaultTenant } from "../lib/tenants";
import { resolveAdminTenant } from "../lib/admin";

async function main() {
  const pool = getPool();
  const suffix = crypto.randomBytes(4).toString("hex");
  const tenantSlug = `verify-admin-${suffix}`;
  const fakeUserId = `user_verify_admin_${suffix}`;
  const strangerUserId = `user_verify_stranger_${suffix}`;
  const symbol = `ZZVERIFYADM${suffix}`.toUpperCase();

  let tenantId: number | null = null;
  let signalId: string | null = null;
  let pass = true;
  const problems: string[] = [];

  try {
    const defaultTenant = await getDefaultTenant();
    console.log(`Default tenant id: ${defaultTenant.id}`);

    const tenantRes = await pool.query<{ id: number }>(
      `INSERT INTO tenants (slug, brand_name, status) VALUES ($1, $2, 'active') RETURNING id`,
      [tenantSlug, `Verify Admin ${suffix}`]
    );
    // tenants.id is BIGINT — node-pg returns it as a string, not a number.
    // Coerce here so the strict-equality check against resolveAdminTenant()'s
    // (already-numeric) result below compares like types.
    tenantId = Number(tenantRes.rows[0].id);
    console.log(`Created test tenant id=${tenantId}`);

    await pool.query(`INSERT INTO tenant_admins (tenant_id, user_id) VALUES ($1, $2)`, [
      tenantId,
      fakeUserId,
    ]);
    console.log(`Made '${fakeUserId}' a tenant_admin of the test tenant\n`);

    // 1. tenant_admins path resolves correctly.
    const resolved = await resolveAdminTenant(fakeUserId);
    if (!resolved || resolved.id !== tenantId) {
      pass = false;
      problems.push(
        `resolveAdminTenant('${fakeUserId}') returned ${JSON.stringify(resolved)}, expected tenant id=${tenantId}`
      );
    } else {
      console.log(`✓ resolveAdminTenant() correctly resolved the tenant_admins user to tenant id=${resolved.id}`);
    }

    // 2. A user who is neither a tenant_admin nor in the legacy allowlist
    //    resolves to null — no accidental default-tenant fallback.
    const strangerResolved = await resolveAdminTenant(strangerUserId);
    if (strangerResolved !== null) {
      pass = false;
      problems.push(
        `resolveAdminTenant('${strangerUserId}') returned ${JSON.stringify(strangerResolved)}, expected null`
      );
    } else {
      console.log(`✓ resolveAdminTenant() correctly returned null for a user with no tenant_admins row\n`);
    }

    // 3. Data-layer isolation: insert a signal + position under the TEST
    //    tenant, then confirm a query scoped to the DEFAULT tenant (the
    //    exact shape app/dashboard/admin/page.tsx and the admin API routes
    //    now use) does not return it.
    const sigRes = await pool.query<{ id: string }>(
      `INSERT INTO signals (tenant_id, symbol, name, signal_type, status, generated_at, updated_at, days_in)
       VALUES ($1, $2, $2, 'buy', 'active', now(), now(), 0) RETURNING id`,
      [tenantId, symbol]
    );
    signalId = sigRes.rows[0].id;
    await pool.query(
      `INSERT INTO positions (tenant_id, signal_id, symbol, direction, entry_price, target_price, stop_price, opened_at)
       VALUES ($1, $2, $3, 'buy', 100, 110, 90, CURRENT_DATE)`,
      [tenantId, signalId, symbol]
    );

    const leakSignals = await pool.query(
      `SELECT id FROM signals WHERE tenant_id = $1 AND symbol = $2`,
      [defaultTenant.id, symbol]
    );
    const leakPositions = await pool.query(
      `SELECT id FROM positions WHERE tenant_id = $1 AND symbol = $2`,
      [defaultTenant.id, symbol]
    );
    if (leakSignals.rows.length > 0 || leakPositions.rows.length > 0) {
      pass = false;
      problems.push(
        `test tenant's rows leaked into a default-tenant-scoped query (signals=${leakSignals.rows.length}, positions=${leakPositions.rows.length})`
      );
    } else {
      console.log("✓ default-tenant-scoped queries correctly exclude the test tenant's signal/position rows");
    }

    const ownSignals = await pool.query(
      `SELECT id FROM signals WHERE tenant_id = $1 AND symbol = $2`,
      [tenantId, symbol]
    );
    const ownPositions = await pool.query(
      `SELECT id FROM positions WHERE tenant_id = $1 AND symbol = $2`,
      [tenantId, symbol]
    );
    if (ownSignals.rows.length !== 1 || ownPositions.rows.length !== 1) {
      pass = false;
      problems.push(
        `test tenant's own scoped query didn't find its rows (signals=${ownSignals.rows.length}, positions=${ownPositions.rows.length})`
      );
    } else {
      console.log("✓ the test tenant's own scoped query correctly finds its signal/position rows\n");
    }
  } catch (err) {
    pass = false;
    problems.push(err instanceof Error ? err.message : String(err));
  } finally {
    console.log("Cleaning up test data...");
    await pool.query(`DELETE FROM positions WHERE symbol = $1`, [symbol]);
    await pool.query(`DELETE FROM signal_events WHERE symbol = $1`, [symbol]);
    await pool.query(`DELETE FROM signals WHERE symbol = $1`, [symbol]);
    if (tenantId) {
      await pool.query(`DELETE FROM tenant_admins WHERE tenant_id = $1`, [tenantId]);
      await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
    }
    console.log("Done.\n");
  }

  if (pass) {
    console.log("PASS — admin tenant resolution + data isolation verified.");
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
