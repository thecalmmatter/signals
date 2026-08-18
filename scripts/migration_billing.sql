-- Billing/trial stage. Idempotent — safe to re-run.
--
-- Trial model: every signed-in user gets full access until their
-- "dry run" ends. The effective cutoff is users.trial_ends_at if the admin
-- set one for that specific person, otherwise app_settings.default_trial_ends_at
-- (a single global cutoff the admin can set/clear for everyone at once).
-- NULL on both means "no cutoff yet" — nobody is blocked until admin sets one.
-- Once trial_ends_at (effective) has passed, access requires
-- users.subscription_status = 'active' (kept in sync by the Razorpay webhook).

ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS razorpay_customer_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT;

CREATE TABLE IF NOT EXISTS app_settings (
    id                     INTEGER PRIMARY KEY DEFAULT 1,
    default_trial_ends_at  TIMESTAMPTZ,
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT app_settings_singleton CHECK (id = 1)
);

INSERT INTO app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

COMMENT ON COLUMN users.trial_ends_at IS
  'Per-user dry-run cutoff, set by admin. NULL = fall back to app_settings.default_trial_ends_at.';
COMMENT ON TABLE app_settings IS
  'Single-row app-wide config. default_trial_ends_at is the dry-run cutoff applied to every user without a personal trial_ends_at override.';
