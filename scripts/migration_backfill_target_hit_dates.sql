-- One-time backfill for currently-open signals whose T1 (or T2/T3) had
-- already been reached before scripts/migration_target_hit_lock.sql existed
-- to record it — otherwise the track record page's checkmark for that
-- target would only appear once live price happens to cross it again.
--
-- Audited against REAL Fyers daily OHLC (not guessed) for every signal that
-- was open on 2026-09-04, entry-date through today:
--
--   TEJASNET  buy, entry 568.2, T1 615  -> hit 2026-09-04 (day high 619.95)
--   SBICARD   buy, entry 641,   T1 668  -> hit 2026-09-04 (day high 668.7)
--   ANANTRAJ  buy, T1 655   -> NOT hit (max high so far 646.4)
--   AKUMS     buy, T1 930.3 -> NOT hit (max high so far 796.55)
--   SAIL      buy, T1 202   -> NOT hit (max high so far 200.96)
--   PNBHOUSING buy, T1 1357 -> NOT hit (max high so far 1211.5)
--   ETERNAL   buy, T1 355   -> NOT hit (max high so far 332.95)
--   HBLENGINE buy, T1 740   -> NOT hit (today's high 724, and it's brand new
--                              so there's no prior history to audit anyway)
--
-- IMPORTANT — separate finding from this same audit, NOT fixed by this
-- migration: AKUMS's day low on 2026-09-04 (748.35) and PNBHOUSING's day low
-- on 2026-09-02 (1125.4) both briefly traded BELOW their stop (751 / 1134)
-- before recovering by the next price poll. The live-quote-polling design
-- only catches a stop/target cross if it happens to coincide with an actual
-- poll, so a brief intraday wick between polls is invisible to it. Whether
-- that should count as "stopped" (any intraday touch) or not (only a
-- sustained/closing breach) is a product decision, not something to guess
-- at in a migration — flagged for a separate fix if the intraday-touch
-- definition is the intended one.
--
-- Safe to run multiple times — only touches rows that still need it.

UPDATE signals
   SET target_1_hit_at = '2026-09-04T12:00:00+05:30'
 WHERE symbol = 'TEJASNET'
   AND status = 'active'
   AND target_1_hit_at IS NULL;

UPDATE signals
   SET target_1_hit_at = '2026-09-04T12:00:00+05:30'
 WHERE symbol = 'SBICARD'
   AND status = 'active'
   AND target_1_hit_at IS NULL;
