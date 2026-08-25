-- Multi-target support: short/medium/long-term targets per signal, instead
-- of a single target price. Idempotent — safe to re-run.
--
-- Naming: the existing target_price column becomes T1 (short-term) — no
-- rename, nothing that already reads target_price breaks. target_price_2
-- (medium) and target_price_3 (long) are new, nullable, additive columns.
-- Older/incomplete signals just show T1 until an admin fills the rest in —
-- never a broken row.
--
-- positions also gets three independent "hit" timestamps (not a single
-- win/loss flag) — a position can have T1 hit while still open, waiting on
-- T2/T3 or the stop. This is separate from positions.status, which still
-- tracks the overall open/hit_stop/closed_manual outcome.

ALTER TABLE signals ADD COLUMN IF NOT EXISTS target_price_2 NUMERIC(12, 2);
ALTER TABLE signals ADD COLUMN IF NOT EXISTS target_price_3 NUMERIC(12, 2);

ALTER TABLE positions ADD COLUMN IF NOT EXISTS target_price_2 NUMERIC(12, 2);
ALTER TABLE positions ADD COLUMN IF NOT EXISTS target_price_3 NUMERIC(12, 2);
ALTER TABLE positions ADD COLUMN IF NOT EXISTS target_1_hit_at TIMESTAMPTZ;
ALTER TABLE positions ADD COLUMN IF NOT EXISTS target_2_hit_at TIMESTAMPTZ;
ALTER TABLE positions ADD COLUMN IF NOT EXISTS target_3_hit_at TIMESTAMPTZ;

COMMENT ON COLUMN signals.target_price IS 'T1 / short-term target.';
COMMENT ON COLUMN signals.target_price_2 IS 'T2 / medium-term target. Nullable — not every signal has one yet.';
COMMENT ON COLUMN signals.target_price_3 IS 'T3 / long-term target. Nullable — not every signal has one yet.';

COMMENT ON COLUMN positions.target_price IS 'T1 / short-term target.';
COMMENT ON COLUMN positions.target_price_2 IS 'T2 / medium-term target. Nullable.';
COMMENT ON COLUMN positions.target_price_3 IS 'T3 / long-term target. Nullable.';
COMMENT ON COLUMN positions.target_1_hit_at IS 'When T1 was manually marked hit. NULL = not hit (or not tracked) yet. Independent of positions.status.';
COMMENT ON COLUMN positions.target_2_hit_at IS 'When T2 was manually marked hit. NULL = not hit yet.';
COMMENT ON COLUMN positions.target_3_hit_at IS 'When T3 was manually marked hit. NULL = not hit yet.';
