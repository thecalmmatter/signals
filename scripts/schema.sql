-- signals_app schema — data layer (Stage 2) extended for Chartlink webhook (Stage 4)
--
-- Two ingestion paths coexist on this table:
-- 1. Webhook (live): app/api/webhooks/chartlink/route.ts. Natural key
--      (symbol, trigger_date, scan_url). One row per Chartlink stock in each alert
--      batch. scan_url (stable slug) is the scan identity, not scan_name.
--   2. Manual/backfill: scripts/ingest_signals.py. Legacy single-row-per-symbol
--      generator output; its rows have NULL trigger_date/scan_url/scan_name.
--
-- Run migrations (live DB) with:
--   psql "$DATABASE_URL" -f scripts/migration_chartlink.sql
--   psql "$DATABASE_URL" -f scripts/migration_chartlink_v2.sql
--   psql "$DATABASE_URL" -f scripts/migration_admin.sql
-- This file is the canonical "fresh setup" version of the same shape.

CREATE TABLE IF NOT EXISTS signals (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    symbol        TEXT           NOT NULL,
    name          TEXT,
    signal_type   TEXT           NOT NULL CHECK (signal_type IN ('buy', 'sell')),
    -- optional market snapshot (card UI). Webhook rows usually only carry a symbol.
    price         NUMERIC(12, 2),
    change_pct    NUMERIC(7, 2),
    entry_price   NUMERIC(12, 2),
    target_price  NUMERIC(12, 2),
    stop_price    NUMERIC(12, 2),
    days_in       INTEGER        NOT NULL DEFAULT 0 CHECK (days_in >= 0),
    days_to_exit  INTEGER        CHECK (days_to_exit >= 0),
    status        TEXT           NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'expired', 'hit_target', 'hit_stop',
                                    'suppressed', 'manual_override')),
    -- provenance: 'webhook' (live Chartlink alert) or 'manual' (admin panel)
    source        TEXT           NOT NULL DEFAULT 'webhook'
                  CHECK (source IN ('webhook', 'manual')),
    -- audit: Clerk user id of whoever last touched the row; notes is free text
    -- (notes is internal — never returned by public routes)
    updated_by    TEXT,
    notes         TEXT,
    -- webhook-triggered rows: scan identity (scan_url slug + last-seen display
    -- name) and the alert's time-of-day in IST (display only, not the date source).
    scan_url          TEXT,
    scan_name         TEXT,
    triggered_at_ist  TEXT,
    trigger_date      DATE,
    -- debugging safety net: exactly what Chartlink sent (as parsed JSON, with
    -- the echoed webhook_url stripped so the token never persists).
    raw_payload   JSONB,
    generated_at  TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ    NOT NULL DEFAULT now(),
    CONSTRAINT signals_symbol_date_scanurl_key UNIQUE (symbol, trigger_date, scan_url)
);

CREATE INDEX IF NOT EXISTS signals_status_idx ON signals (status);
CREATE INDEX IF NOT EXISTS signals_generated_at_idx ON signals (generated_at);

COMMENT ON TABLE signals IS
  'Swing trade signals. Live rows come from the Chartlink webhook (keyed on symbol+trigger_date+scan_url); legacy rows from scripts/ingest_signals.py have NULL scan identity.';

-- Small log of webhook events; notably records when a trigger hit a
-- suppressed/manual_override signal and was left untouched, and when a scan is
-- not yet present in scan_mappings.
CREATE TABLE IF NOT EXISTS signal_events (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    signal_id    BIGINT REFERENCES signals(id) ON DELETE SET NULL,
    event_type   TEXT NOT NULL
                 CHECK (event_type IN ('trigger', 'override_preserved', 'malformed', 'error',
                                       'manual_suppressed', 'manual_reactivated',
                                       'manual_created', 'manual_edited', 'unmapped_scan')),
    symbol       TEXT,
    trigger_date DATE,
    scan_name    TEXT,
    scan_url     TEXT,
    detail       TEXT,
    raw_payload  JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS signal_events_signal_id_idx    ON signal_events (signal_id);
CREATE INDEX IF NOT EXISTS signal_events_created_at_idx   ON signal_events (created_at);

-- Authoritative scan -> signal_type direction table. The webhook looks the
-- alert's scan_url up here; unknown or inactive scans are skipped (logged as
-- unmapped_scan), never guessed.
CREATE TABLE IF NOT EXISTS scan_mappings (
    scan_url    TEXT PRIMARY KEY,
    scan_name   TEXT,
    signal_type TEXT NOT NULL CHECK (signal_type IN ('buy', 'sell')),
    active      BOOLEAN NOT NULL DEFAULT true,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE scan_mappings IS
  'Maps a Chartlink scan_url slug to its signal direction. Seed rows manually (or via the admin control, next stage). Unknown scans are skipped with an unmapped_scan event rather than guessed.';
