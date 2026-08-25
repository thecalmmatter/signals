-- Sticky live outcome — once a signal's live price crosses its stop or a
-- target, lib/live-signals.ts persists that fact here so the ticker/track
-- record DIR badge never flips back to BUY/SELL just because the price
-- recovered. Only an admin editing the signal (PATCH /api/signals/[id])
-- clears it, which is the intended "manually removed" reset.

ALTER TABLE signals ADD COLUMN IF NOT EXISTS outcome_locked TEXT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS outcome_locked_at TIMESTAMPTZ;

COMMENT ON COLUMN signals.outcome_locked IS
  'Sticky live-derived outcome: NULL (still governed by live price), ''stopped'', or ''target_hit''. Set once by lib/live-signals.ts the first time live price crosses the stop or a target; never reverts on its own. Cleared by an admin edit (PATCH /api/signals/[id]).';
COMMENT ON COLUMN signals.outcome_locked_at IS
  'When outcome_locked was first set.';
