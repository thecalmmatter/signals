-- Links the positions ledger to the signal that generated it, so the ledger
-- can auto-populate whenever a signal gets entry/target/stop — no separate
-- "log this position" form required for the normal flow anymore.
--
-- Nullable + ON DELETE SET NULL: positions logged before this migration (or
-- for a symbol that never had a signals row) simply have no link and stay
-- as freestanding ledger rows, same as before.

ALTER TABLE positions ADD COLUMN IF NOT EXISTS signal_id BIGINT REFERENCES signals(id) ON DELETE SET NULL;

-- One ledger row per signal: re-saving a signal's entry/target/stop updates
-- its existing position instead of creating a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS positions_signal_id_key ON positions (signal_id) WHERE signal_id IS NOT NULL;

COMMENT ON COLUMN positions.signal_id IS
  'The signals row this position was auto-populated from, if any. NULL = logged by hand (e.g. a call Chartlink never fired on).';
