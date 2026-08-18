-- Admin panel stage: extend `signals` + `signal_events` for manual controls.
-- Applied to the live Neon DB via:
--   psql "$DATABASE_URL" -f scripts/migration_admin.sql

-- 1) signals: provenance + audit columns.
--    source     — where the row came from ('webhook' or 'manual'). Existing rows
--                 were all webhook/ingest-fed, so default 'webhook'.
--    updated_by — Clerk user id of whoever last touched the row (admin stage).
--    notes      — free-text admin note (never exposed on public routes).
ALTER TABLE signals
  ADD COLUMN IF NOT EXISTS source     TEXT NOT NULL DEFAULT 'webhook',
  ADD COLUMN IF NOT EXISTS updated_by TEXT,
  ADD COLUMN IF NOT EXISTS notes      TEXT;

ALTER TABLE signals DROP CONSTRAINT IF EXISTS signals_source_check;
ALTER TABLE signals ADD CONSTRAINT signals_source_check
  CHECK (source IN ('webhook', 'manual'));

-- 2) signal_events: add admin action event types. Manual actions carry no
--    webhook payload, so those rows set raw_payload NULL and use `detail`.
ALTER TABLE signal_events DROP CONSTRAINT IF EXISTS signal_events_event_type_check;
ALTER TABLE signal_events ADD CONSTRAINT signal_events_event_type_check
  CHECK (event_type IN ('trigger', 'override_preserved', 'malformed', 'error',
                        'manual_suppressed', 'manual_reactivated', 'manual_created', 'manual_edited'));