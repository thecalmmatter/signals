-- Leads captured by the dedicated Telegram ads bot (@SignalsLeadsBot),
-- separate from TELEGRAM_BOT_TOKEN (which only sends outbound admin alerts
-- and never receives anything). Every /start on this bot lands here.
-- start_param carries whatever ?start=... payload was on the ad's deep
-- link (e.g. "ph_ad"), so you can tell which ad/placement actually drove
-- the tap.

CREATE TABLE IF NOT EXISTS telegram_leads (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    telegram_user_id BIGINT NOT NULL,
    username         TEXT,
    first_name       TEXT,
    start_param      TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT telegram_leads_user_id_key UNIQUE (telegram_user_id)
);

CREATE INDEX IF NOT EXISTS telegram_leads_created_at_idx ON telegram_leads (created_at);
CREATE INDEX IF NOT EXISTS telegram_leads_start_param_idx ON telegram_leads (start_param);

COMMENT ON TABLE telegram_leads IS
  'One row per unique Telegram user who has ever hit /start on the leads bot. Re-starting updates username/first_name/start_param on the existing row rather than duplicating it.';
