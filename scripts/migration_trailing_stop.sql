-- Trailing stop loss — per-trade opt-in, live signals only (the `signals`
-- table, which is what loadLiveSignals()/computeOutcome() and the public
-- track-record ("tradebook") page actually run off; the `positions` ledger
-- table is a separate, manually-operated table that as of 2026-09 has never
-- had a row closed by an admin in production, so trailing SL is not mirrored
-- there — see lib/live-signals.ts for the reasoning).
--
-- Backed by a one-time backtest (2026-09-21, 10 real closed trades) that
-- found trailing SL clearly helps trades that move favorably before
-- reversing (the fixed stop gives the whole move back), and does nothing for
-- trades that fall straight from entry — hence per-trade opt-in, not a
-- blanket default, with an admin-chosen % rather than one hardcoded width.
--
-- Method: trail a fixed % below the peak price reached since entry (buy) or
-- above the trough since entry (sell) — see trailingStopLevel() in
-- lib/live-signals.ts. Activates immediately from entry, no "wait for T1"
-- gating. When enabled, the trailing level REPLACES stop_price as the
-- level checked in computeOutcome() — stop_price itself is left untouched
-- (still shown/used as the reference if trailing is ever turned back off).

ALTER TABLE signals ADD COLUMN IF NOT EXISTS trailing_sl_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS trailing_sl_pct NUMERIC(5, 2);
ALTER TABLE signals ADD COLUMN IF NOT EXISTS trailing_peak_price NUMERIC(12, 2);

COMMENT ON COLUMN signals.trailing_sl_enabled IS
  'Per-trade opt-in — when true, the live stop check in computeOutcome() uses the trailing level (peak/trough since entry, trailing_sl_pct below/above it) instead of stop_price. Defaults false; an admin turns it on per signal, it is never on by default.';
COMMENT ON COLUMN signals.trailing_sl_pct IS
  'Trail width as a percent (e.g. 5.00 = 5%). NULL while trailing_sl_enabled is false. Chosen per trade by the admin, not a single global width — the backtest found no one width that was best across every trade.';
COMMENT ON COLUMN signals.trailing_peak_price IS
  'Ratchet state: highest price reached since entry for a buy, lowest for a sell. Initialized to entry_price the moment trailing_sl_enabled is turned on (or entry is set), then only ever moves favorably. Reset to entry_price whenever an admin edits the signal (same "an edit invalidates prior history" rule as outcome_locked/target_N_hit_at). NULL while trailing is disabled.';
