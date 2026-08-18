-- Chartlink parser tighten (stage 4 follow-up): scan identity via scan_url,
-- IST date handling, and a scan_mappings direction table.
-- Applied to the live Neon DB via:
--   psql "$DATABASE_URL" -f scripts/migration_chartlink_v2.sql

-- 1) signals: track the stable scan slug + the alert's time (IST, display only).
--    The upsert key moves from scan_name (free text, renamable) to scan_url.
ALTER TABLE signals
  ADD COLUMN IF NOT EXISTS scan_url        TEXT,
  ADD COLUMN IF NOT EXISTS triggered_at_ist TEXT;

DROP INDEX IF EXISTS signals_symbol_date_scan_key;
CREATE UNIQUE INDEX IF NOT EXISTS signals_symbol_date_scanurl_key
  ON signals (symbol, trigger_date, scan_url);

-- 2) signal_events: carry scan_url context; add the unknown-scan event type.
ALTER TABLE signal_events ADD COLUMN IF NOT EXISTS scan_url TEXT;
ALTER TABLE signal_events DROP CONSTRAINT IF EXISTS signal_events_event_type_check;
ALTER TABLE signal_events ADD CONSTRAINT signal_events_event_type_check
  CHECK (event_type IN ('trigger', 'override_preserved', 'malformed', 'error',
                        'manual_suppressed', 'manual_reactivated', 'manual_created', 'manual_edited',
                        'unmapped_scan'));

-- 3) scan_mappings: authoritative scan -> signal_type direction table.
--    The webhook looks up scan_url here; unknown/inactive scans are skipped
--    (logged as unmapped_scan), never guessed.
CREATE TABLE IF NOT EXISTS scan_mappings (
    scan_url    TEXT PRIMARY KEY,
    scan_name   TEXT,   -- last seen display name (informational only)
    signal_type TEXT NOT NULL CHECK (signal_type IN ('buy', 'sell')),
    active      BOOLEAN NOT NULL DEFAULT true,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed placeholder for manish-goel-scan. Direction is UNCONFIRMED (owner decides
-- after an actual signal), so it is inserted INACTIVE: any real alert for it is
-- skipped as unmapped_scan until the owner flips active + sets signal_type.
INSERT INTO scan_mappings (scan_url, scan_name, signal_type, active)
VALUES ('manish-goel-scan', 'Manish Goel Scan', 'buy', false)
ON CONFLICT (scan_url) DO NOTHING;