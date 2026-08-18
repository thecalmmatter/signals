-- Positions ledger: a manual, admin-kept record of the daily swing positions
-- actually posted to the community (Reddit/Telegram/etc.), independent of
-- the `signals` table. Idempotent — safe to re-run.
--
-- Not FK'd to signals: a "position" here is "I called this trade publicly on
-- this date," which can outlive or diverge from whatever the ticker/admin
-- signals view is currently showing for that symbol. This is the source of
-- truth for a public track record / statistical-edge report later.

CREATE TABLE IF NOT EXISTS positions (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    symbol       TEXT NOT NULL,
    direction    TEXT NOT NULL CHECK (direction IN ('buy', 'sell')),
    entry_price  NUMERIC(12,2) NOT NULL,
    target_price NUMERIC(12,2) NOT NULL,
    stop_price   NUMERIC(12,2) NOT NULL,
    exit_price   NUMERIC(12,2),
    status       TEXT NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open', 'hit_target', 'hit_stop', 'closed_manual')),
    opened_at    DATE NOT NULL DEFAULT CURRENT_DATE,
    closed_at    DATE,
    notes        TEXT,
    created_by   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS positions_opened_at_idx ON positions (opened_at DESC);
CREATE INDEX IF NOT EXISTS positions_status_idx ON positions (status);
CREATE INDEX IF NOT EXISTS positions_symbol_idx ON positions (symbol);

COMMENT ON TABLE positions IS
  'Admin-kept track record of daily swing positions actually posted publicly. Separate from signals (which drives the live ticker) — this is the historical ledger for a future statistical-edge / win-rate report.';
COMMENT ON COLUMN positions.status IS
  'open = still running. hit_target/hit_stop = closed by price action. closed_manual = admin closed it another way (e.g. time-based exit) — exit_price should be set whenever status leaves open.';
