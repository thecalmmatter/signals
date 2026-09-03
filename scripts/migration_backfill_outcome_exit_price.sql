-- One-time backfill for signals that were locked (outcome_locked =
-- 'target_hit' / 'stopped') before scripts/migration_telegram_digest.sql
-- introduced outcome_exit_price, or that otherwise ended up with that column
-- NULL despite being locked.
--
-- Bug this fixes: lib/live-signals.ts fell back to *today's live price* for
-- any locked row with a NULL outcome_exit_price, so a "closed" trade's
-- displayed return kept drifting with the market every day instead of
-- staying frozen — e.g. MCX showed +5.7% instead of the real ~+10.4% it
-- earned by actually crossing its ₹3,328 target on 2026-08-26 (verified
-- against real Fyers OHLC). The correct exit reference for a closed trade is
-- the level that closed it — the target it hit, or the stop it hit — not a
-- live quote taken days later. The code fallback is fixed too (see
-- lib/live-signals.ts); this backfill makes existing rows correct in the DB
-- itself, since lib/telegram-digest.ts reads outcome_exit_price straight
-- from the column and silently skips rows where it's NULL.
--
-- Safe to run multiple times — only touches rows that still need it.

UPDATE signals
   SET outcome_exit_price = target_price
 WHERE outcome_locked = 'target_hit'
   AND outcome_exit_price IS NULL
   AND target_price IS NOT NULL;

UPDATE signals
   SET outcome_exit_price = stop_price
 WHERE outcome_locked = 'stopped'
   AND outcome_exit_price IS NULL
   AND stop_price IS NOT NULL;
