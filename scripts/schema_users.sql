-- users table — synced from Clerk via /api/webhooks/clerk on user.created / user.updated.
-- subscription_status is populated by the billing stage (next up); 'none' is the default.

CREATE TABLE IF NOT EXISTS users (
    id                       TEXT PRIMARY KEY,          -- Clerk user id
    email                    TEXT NOT NULL,
    first_name               TEXT,
    last_name                TEXT,
    subscription_status      TEXT NOT NULL DEFAULT 'none',
    -- Billing stage (see migration_billing.sql for the same columns applied
    -- to an existing table). trial_ends_at is a per-user dry-run override set
    -- by admin; NULL falls back to app_settings.default_trial_ends_at.
    trial_ends_at            TIMESTAMPTZ,
    razorpay_customer_id     TEXT,
    razorpay_subscription_id TEXT,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users (email);

CREATE TABLE IF NOT EXISTS app_settings (
    id                     INTEGER PRIMARY KEY DEFAULT 1,
    default_trial_ends_at  TIMESTAMPTZ,
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT app_settings_singleton CHECK (id = 1)
);

INSERT INTO app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE users IS
  'User records synced from Clerk. subscription_status is kept in sync by the Razorpay webhook.';
COMMENT ON TABLE app_settings IS
  'Single-row app-wide config. default_trial_ends_at is the dry-run cutoff applied to every user without a personal trial_ends_at override.';