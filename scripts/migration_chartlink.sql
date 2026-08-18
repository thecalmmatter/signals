-- Chartlink webhook stage: extend `signals` for webhook-triggered rows.
-- Applied to the live Neon DB via:
--   psql "$DATABASE_URL" -f scripts/migration_chartlink.sql

-- 1) Webhook-specific columns. trigger_date + scan_name form the new natural
--    key together with symbol; raw_payload is the debugging safety net holding
--    exactly what Chartlink sent (adjusted to match real payloads later).
ALTER TABLE signals
  ADD COLUMN IF NOT EXISTS trigger_date DATE,
  ADD COLUMN IF NOT EXISTS scan_name    TEXT,
  ADD COLUMN IF NOT EXISTS raw_payload  JSONB;

-- 2) Chartlink alerts carry a symbol + scan name, not necessarily entry/target/
--    stop prices (those were NOT NULL for the Python-generator era). Relax them
--    so a webhook row with no price levels is still valid; the card UI treats
--    missing values as 0.
ALTER TABLE signals ALTER COLUMN entry_price DROP NOT NULL;
ALTER TABLE signals ALTER COLUMN target_price DROP NOT NULL;
ALTER TABLE signals ALTER COLUMN stop_price  DROP NOT NULL;
ALTER TABLE signals ALTER COLUMN days_to_exit DROP NOT NULL;

-- 3) Extend status enum with admin-only statuses used by the next stage's panel.
--    A webhook must never flip these back to active.
ALTER TABLE signals DROP CONSTRAINT IF EXISTS signals_status_check;
ALTER TABLE signals ADD CONSTRAINT signals_status_check
  CHECK (status IN ('active', 'expired', 'hit_target', 'hit_stop', 'suppressed', 'manual_override'));

-- 4) Replace the old single-row-per-(symbol, signal_type) key with the webhook
--    key (symbol, trigger_date, scan_name). Legacy seeded rows have NULL
--    trigger_date/scan_name; NULLs are distinct in Postgres unique indexes, so
--    they are unaffected. Two NULL dates also lets a manual backfill insert
--    multiple rows without tripping the old constraint.
ALTER TABLE signals DROP CONSTRAINT IF EXISTS signals_symbol_signal_type_key;
CREATE UNIQUE INDEX IF NOT EXISTS signals_symbol_date_scan_key
  ON signals (symbol, trigger_date, scan_name);

-- 5) Small webhook event log. Notably records when a trigger arrives for a
--    signal whose status is suppressed/manual_override (the alert fired but the
--    write was suppressed to preserve the human decision).
CREATE TABLE IF NOT EXISTS signal_events (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    signal_id    BIGINT REFERENCES signals(id) ON DELETE SET NULL,
    event_type   TEXT NOT NULL
                 CHECK (event_type IN ('trigger', 'override_preserved', 'malformed', 'error')),
    symbol       TEXT,
    trigger_date DATE,
    scan_name    TEXT,
    detail       TEXT,
    raw_payload  JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS signal_events_signal_id_idx    ON signal_events (signal_id);
CREATE INDEX IF NOT EXISTS signal_events_created_at_idx   ON signal_events (created_at);
