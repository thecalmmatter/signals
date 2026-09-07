-- Multi-tenancy Phase 2, step 1: tenant_id on `positions`.
--
-- Phase 1 (scripts/migration_tenants.sql) only scoped `signals`. `positions`
-- (the track-record ledger) was left un-scoped — GET /api/admin/positions
-- returns every row in the table with no tenant filter at all. That's fine
-- with a single tenant, but the moment a second tenant's admin exists
-- (Phase 2's tenant_admins-based admin auth, see lib/admin.ts) they'd see
-- every other tenant's ledger too. This migration closes that gap the same
-- way Phase 1 closed it for `signals`: additive, backfilled to the seeded
-- 'default' tenant, zero behavior change for the current single-operator
-- instance.
--
-- Backfill logic:
--   - Rows with a signal_id (the common case — auto-populated from a signal,
--     see lib/positions-admin.ts upsertPositionFromSignal) inherit that
--     signal's tenant_id directly. A signal's tenant is authoritative; its
--     position row must belong to the same tenant.
--   - Rows with no signal_id (hand-logged via POST /api/admin/positions,
--     with no linked signal) have no tenant signal to inherit from — these
--     backfill to the 'default' tenant, since every position row in
--     production today was created by the single existing operator.
--
-- Run this AFTER scripts/migration_tenants.sql (needs the tenants table and
-- signals.tenant_id to already exist).

ALTER TABLE positions ADD COLUMN IF NOT EXISTS tenant_id BIGINT REFERENCES tenants(id);

UPDATE positions p
   SET tenant_id = s.tenant_id
  FROM signals s
 WHERE p.signal_id = s.id
   AND p.tenant_id IS NULL;

UPDATE positions
   SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default')
 WHERE tenant_id IS NULL;

ALTER TABLE positions ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS positions_tenant_id_idx ON positions (tenant_id);
