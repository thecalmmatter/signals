-- Sticky per-target "reached" tracking for the live signals feed — parallel
-- to signals.outcome_locked (overall trade status), but per target level.
--
-- Bug this fixes: the track record page's T1/T2/T3 checkmarks were a pure
-- live-price comparison recomputed on every request, with no memory. A
-- target that was genuinely reached and then pulled back below it would
-- silently un-check itself — wrong, since the target WAS hit and that
-- doesn't un-happen. See computeOutcome()/loadLiveSignals() in
-- lib/live-signals.ts for the sticky read/write logic.
--
-- Distinct from positions.target_1_hit_at/2/3 (scripts/migration_multi_target.sql)
-- — those are set MANUALLY by an admin on the separate positions ledger.
-- These are computed automatically from live price, same as outcome_locked.

ALTER TABLE signals ADD COLUMN IF NOT EXISTS target_1_hit_at TIMESTAMPTZ;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS target_2_hit_at TIMESTAMPTZ;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS target_3_hit_at TIMESTAMPTZ;

COMMENT ON COLUMN signals.target_1_hit_at IS
  'When live price first crossed target_price in the favorable direction. NULL = not reached yet. Sticky — never cleared by price moving back, only by an admin edit (PATCH /api/signals/[id]).';
COMMENT ON COLUMN signals.target_2_hit_at IS 'Same as target_1_hit_at, for target_price_2.';
COMMENT ON COLUMN signals.target_3_hit_at IS 'Same as target_1_hit_at, for target_price_3.';
