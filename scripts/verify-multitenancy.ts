// Automated smoke test for multi-tenancy Phase 1 (scripts/migration_tenants.sql).
//
// What it proves, without touching the UI:
//   1. A tenant's own chartlink_webhook_token correctly resolves to THAT
//      tenant (not the 'default' one) in app/api/webhooks/chartlink/route.ts.
//   2. The resulting signals row is tagged with the new tenant's tenant_id.
//   3. That row is invisible to the default tenant's data path — i.e. it
//      would NOT show up on /dashboard/track-record today, proving isolation
//      actually works at the data layer.
//
// Creates its own throwaway tenant + scan_mapping + signal (all clearly
// namespaced with a "verify-mt-" prefix and a random suffix), hits the real
// deployed webhook over HTTP, checks the DB, then deletes everything it
// created. Safe to run against production — never touches real tenants,
// scans, or symbols.
//
// Usage (run from the project root):
//   ./scripts/verify-multitenancy.sh
//   ./scripts/verify-multitenancy.sh https://signals-tawny.vercel.app
//   npx tsx scripts/verify-multitenancy.ts --base-url=https://signals-tawny.vercel.app
//
// Flags:
//   --base-url=...   defaults to https://signals-tawny.vercel.app
//   --keep           don't clean up afterwards (so you can inspect the rows
//                     by hand); prints the exact cleanup SQL to run later.
//
// Needs DATABASE_URL (same as the app / other scripts/*.ts) — source
// .env.local first, or use the .sh wrapper which does that for you.

import crypto from "node:crypto";
import { getPool } from "../lib/db";
import { getDefaultTenant } from "../lib/tenants";

function parseArgs(argv: string[]) {
  const baseUrlArg = argv.find((a) => a.startsWith("--base-url="));
  return {
    baseUrl: (baseUrlArg?.split("=")[1] ?? "https://signals-tawny.vercel.app").replace(/\/+$/, ""),
    keep: argv.includes("--keep"),
  };
}

function nowIstTimeOfDay(): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date())
    .toLowerCase();
}

async function main() {
  const { baseUrl, keep } = parseArgs(process.argv.slice(2));
  const pool = getPool();
  const suffix = crypto.randomBytes(4).toString("hex");
  const symbol = `ZZVERIFYMT${suffix}`.toUpperCase();
  const scanUrl = `verify-mt-${suffix}`;
  const tenantSlug = `verify-mt-${suffix}`;
  const webhookToken = crypto.randomBytes(16).toString("hex");

  let tenantId: number | null = null;
  let pass = true;
  const problems: string[] = [];

  try {
    console.log(`Base URL:   ${baseUrl}`);
    console.log(`Test symbol: ${symbol}`);
    console.log(`Test tenant: ${tenantSlug}\n`);

    const defaultTenant = await getDefaultTenant();
    console.log(`Default tenant id: ${defaultTenant.id} (slug='${defaultTenant.slug}')`);

    // 1. Create the throwaway tenant + scan mapping.
    const tenantRes = await pool.query<{ id: number }>(
      `INSERT INTO tenants (slug, brand_name, chartlink_webhook_token, status)
       VALUES ($1, $2, $3, 'active') RETURNING id`,
      [tenantSlug, `Verify MT ${suffix}`, webhookToken]
    );
    tenantId = tenantRes.rows[0].id;
    console.log(`Created test tenant id=${tenantId}`);

    await pool.query(
      `INSERT INTO scan_mappings (scan_url, signal_type, active) VALUES ($1, 'buy', true)`,
      [scanUrl]
    );
    console.log(`Created test scan_mapping scan_url='${scanUrl}'\n`);

    // 2. Fire a real webhook request at the deployed app using the test
    //    tenant's own token — exactly what a reseller's Chartlink account
    //    would do.
    const webhookUrl = `${baseUrl}/api/webhooks/chartlink?token=${webhookToken}`;
    console.log(`POSTing test alert to ${webhookUrl} ...`);
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stocks: symbol,
        trigger_prices: "100.00",
        triggered_at: nowIstTimeOfDay(),
        scan_name: "verify-multitenancy",
        scan_url: scanUrl,
      }),
    });
    const resBody = await res.json().catch(() => null);
    console.log(`Response: ${res.status} ${JSON.stringify(resBody)}\n`);

    if (res.status !== 200 || !resBody?.ok || resBody.processed !== 1) {
      pass = false;
      problems.push(`webhook did not accept the test alert cleanly (status=${res.status}, body=${JSON.stringify(resBody)})`);
    }

    // Webhook write is synchronous (awaited inside the route before it
    // responds), so no need to poll/sleep here.

    // 3. Verify the row landed under the TEST tenant, not the default one.
    const rowRes = await pool.query<{ id: number; tenant_id: number }>(
      `SELECT id, tenant_id FROM signals WHERE symbol = $1 AND scan_url = $2`,
      [symbol, scanUrl]
    );
    if (rowRes.rows.length !== 1) {
      pass = false;
      problems.push(`expected exactly 1 signals row for ${symbol}/${scanUrl}, found ${rowRes.rows.length}`);
    } else {
      const row = rowRes.rows[0];
      console.log(`signals row: id=${row.id} tenant_id=${row.tenant_id}`);
      if (row.tenant_id !== tenantId) {
        pass = false;
        problems.push(`signals.tenant_id=${row.tenant_id}, expected the test tenant's id=${tenantId}`);
      } else {
        console.log("✓ row correctly tagged with the test tenant's id, not the default tenant's");
      }
    }

    // 4. Verify isolation: this symbol must NOT be visible under the
    //    default tenant (i.e. would not appear on today's track-record page,
    //    which is still hardwired to the default tenant).
    const leakRes = await pool.query<{ count: string }>(
      `SELECT count(*)::int AS count FROM signals WHERE symbol = $1 AND tenant_id = $2`,
      [symbol, defaultTenant.id]
    );
    const leakCount = Number(leakRes.rows[0]?.count ?? 0);
    if (leakCount > 0) {
      pass = false;
      problems.push(`found ${leakCount} row(s) for ${symbol} under the DEFAULT tenant — isolation broken`);
    } else {
      console.log("✓ no rows for this symbol under the default tenant — isolation holds\n");
    }
  } catch (err) {
    pass = false;
    problems.push(err instanceof Error ? err.message : String(err));
  } finally {
    if (keep) {
      console.log("--keep passed — leaving test data in place. Clean up later with:\n");
      console.log(`  DELETE FROM signal_events WHERE symbol = '${symbol}';`);
      console.log(`  DELETE FROM signals WHERE symbol = '${symbol}';`);
      console.log(`  DELETE FROM scan_mappings WHERE scan_url = '${scanUrl}';`);
      console.log(`  DELETE FROM tenants WHERE slug = '${tenantSlug}';\n`);
    } else {
      console.log("Cleaning up test data...");
      await pool.query(`DELETE FROM signal_events WHERE symbol = $1`, [symbol]);
      await pool.query(`DELETE FROM signals WHERE symbol = $1`, [symbol]);
      await pool.query(`DELETE FROM scan_mappings WHERE scan_url = $1`, [scanUrl]);
      if (tenantId) await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
      console.log("Done.\n");
    }
  }

  if (pass) {
    console.log("PASS — multi-tenancy Phase 1 isolation verified.");
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
