-- Multi-tenancy, phase 1: foundational tenants table + tenant_id on
-- `signals`, backfilled to a single "default" tenant so the existing
-- single-operator production instance keeps working completely unchanged.
--
-- Why a reseller/white-label platform needs this: today the whole app is
-- one operator, one signal feed, one Telegram bot, one admin allowlist
-- (ADMIN_USER_IDS). Reselling to N independent SEBI-registered advisors,
-- each running their own Telegram audience under their own brand and
-- registration, means signals/users/billing all need a tenant scope — see
-- reseller-competitor-analysis.md §2 for the full reasoning.
--
-- This migration is deliberately narrow and additive:
--   - New tenants / tenant_admins tables.
--   - signals.tenant_id, backfilled to the 'default' tenant, then made
--     NOT NULL (every row must belong to somebody).
--   - The chartlink webhook's existing CHARTLINK_WEBHOOK_TOKEN env var
--     keeps working as-is (it becomes the 'default' tenant's webhook
--     token) — nothing about the current live pipeline changes yet.
--
-- Explicitly NOT done here (follow-up phases, on purpose — each is a
-- bigger, riskier change than this one):
--   - scan_mappings is NOT yet tenant-scoped (its primary key is scan_url
--     alone; two tenants wanting different mappings for the same scan_url
--     needs a composite key change, deferred).
--   - Billing (Razorpay), Telegram bot config, and broker (Fyers)
--     credentials are still global env vars, not per-tenant yet.
--   - lib/admin.ts's ADMIN_USER_IDS allowlist is untouched — tenant_admins
--     exists so new tenant-scoped code can start using it, but no existing
--     admin route has been migrated off the global allowlist yet.

CREATE TABLE IF NOT EXISTS tenants (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug                      TEXT NOT NULL UNIQUE,
    brand_name                TEXT NOT NULL,
    -- Compliance attribution (reseller-competitor-analysis.md §1a) — every
    -- signal this tenant publishes should carry this, once the UI/Telegram
    -- templates are updated to actually render it (follow-up phase).
    sebi_reg_name             TEXT,
    sebi_reg_number           TEXT,
    -- Lets each reseller's Chartlink alerts hit the same webhook route
    -- with their own token, instead of sharing the operator's.
    chartlink_webhook_token   TEXT UNIQUE,
    -- Per-tenant Telegram bot config — NULL until the Telegram-scoping
    -- follow-up phase actually reads these instead of the global env vars.
    telegram_bot_token        TEXT,
    telegram_chat_id          TEXT,
    status                    TEXT NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'suspended')),
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE tenants IS
  'One row per reseller (or the operator itself, as the seeded ''default'' tenant). Phase 1 of multi-tenancy — see this file''s header comment for what is/isn''t scoped yet.';

-- Which Clerk users can administer a given tenant. Additive alongside
-- lib/admin.ts's ADMIN_USER_IDS env allowlist for now, not a replacement —
-- existing admin routes keep using the env list until they're migrated.
CREATE TABLE IF NOT EXISTS tenant_admins (
    tenant_id  BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, user_id)
);

-- Seed the 'default' tenant representing today's single-operator instance.
-- chartlink_webhook_token is left NULL here deliberately — the webhook
-- route falls back to the CHARTLINK_WEBHOOK_TOKEN env var for this tenant
-- specifically (see app/api/webhooks/chartlink/route.ts), so nothing about
-- the live Chartlink integration needs to change today. Set an explicit
-- token here later if/when you want the default tenant to also use the
-- token-lookup path instead of the env-var fallback.
INSERT INTO tenants (slug, brand_name, status)
VALUES ('default', 'Signals', 'active')
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE signals ADD COLUMN IF NOT EXISTS tenant_id BIGINT REFERENCES tenants(id);

UPDATE signals
   SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default')
 WHERE tenant_id IS NULL;

ALTER TABLE signals ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS signals_tenant_id_idx ON signals (tenant_id);

-- The chartlink webhook's upsert (ON CONFLICT (symbol, trigger_date, scan_url))
-- relies on this constraint as its conflict target. Scoping it by tenant_id
-- too means two different tenants running the same scan on the same symbol
-- on the same day upsert independently instead of colliding — with only the
-- 'default' tenant existing today this changes nothing observable, but it
-- has to be right before a second tenant's Chartlink alerts can safely
-- share this table. app/api/webhooks/chartlink/route.ts's ON CONFLICT
-- target is updated to match in the same commit as this migration.
ALTER TABLE signals DROP CONSTRAINT IF EXISTS signals_symbol_date_scanurl_key;
ALTER TABLE signals ADD CONSTRAINT signals_tenant_symbol_date_scanurl_key
  UNIQUE (tenant_id, symbol, trigger_date, scan_url);
