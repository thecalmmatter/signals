-- Multi-tenancy Phase 3: tenant_customers — which tenant a signed-in
-- CUSTOMER (not an admin) belongs to, so the customer-facing dashboard,
-- track record page, and /api/signals ticker feed can finally show a
-- second tenant's own signals to that tenant's own subscribers, instead of
-- every signed-in user seeing the 'default' tenant's feed regardless.
--
-- Distinct from tenant_admins (scripts/migration_tenants.sql), which
-- controls who can manage a tenant's signals in /dashboard/admin. This
-- table controls what a regular subscriber SEES on /dashboard.
--
-- One row per user (PRIMARY KEY on user_id, not composite like
-- tenant_admins) — a customer belongs to exactly one tenant. No row means
-- "an existing single-operator-instance customer"; lib/tenants.ts's
-- resolveCustomerTenant() falls back to the 'default' tenant for those, so
-- every current subscriber's dashboard is completely unaffected by this
-- migration.
--
-- Still no signup UI writes to this table (deliberately deferred, same as
-- tenant_admins) — assigning a customer to a tenant today means inserting
-- a row here by hand, e.g.:
--   INSERT INTO tenant_customers (tenant_id, user_id)
--   VALUES ((SELECT id FROM tenants WHERE slug = 'some-reseller'), 'user_...');

CREATE TABLE IF NOT EXISTS tenant_customers (
    user_id    TEXT PRIMARY KEY,
    tenant_id  BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenant_customers_tenant_id_idx ON tenant_customers (tenant_id);
