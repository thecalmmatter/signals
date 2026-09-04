-- One-time correction for open signals whose stop was genuinely touched
-- intraday before this fix existed, but recovered before the next live
-- price poll caught it -- see computeOutcome()/isFavorable() in
-- lib/live-signals.ts, now fixed to check the day's high/low instead of
-- only the current tick. Rule, per product decision: if SL is touched, via
-- a dip or otherwise, the trade is done -- full stop, no "but it recovered."
--
-- Audited against REAL Fyers daily OHLC (not guessed):
--
--   AKUMS      buy, stop 751,  entry 2026-08-31 -> day LOW on 2026-09-04
--              was 748.35 (below stop). Unambiguous: the breach day is 4
--              trading days after entry, no same-day entry-timing question.
--   PNBHOUSING buy, stop 1134, entry 2026-08-20 -> day LOW on 2026-09-02
--              was 1125.4 (below stop). Unambiguous for the same reason.
--
-- Deliberately EXCLUDED from this backfill (checked, not just skipped):
--   TEJASNET and HBLENGINE both also show a same-day-as-entry low below
--   their stop (TEJASNET: 551.3 vs stop 553 on 2026-09-03, its entry day;
--   HBLENGINE: 667 vs stop 676 on 2026-09-04, its entry day). Because the
--   entry and the low happened on the SAME calendar day, a daily candle
--   can't tell us whether that low printed before or after the actual
--   entry trigger -- if it was pre-entry price action, it's not a real
--   stop breach of a trade that wasn't open yet. Confirming this one way or
--   the other needs the exact trigger timestamp (signals.triggered_at_ist)
--   cross-referenced against intraday (15-min or finer) candles, not
--   guessed here. Left as-is; revisit if it matters.
--
-- Safe to run multiple times — only touches rows that are still open.

UPDATE signals
   SET outcome_locked = 'stopped',
       outcome_locked_at = '2026-09-04T15:00:00+05:30',
       outcome_exit_price = stop_price
 WHERE symbol = 'AKUMS'
   AND status = 'active'
   AND outcome_locked IS NULL
   AND stop_price IS NOT NULL;

UPDATE signals
   SET outcome_locked = 'stopped',
       outcome_locked_at = '2026-09-02T15:00:00+05:30',
       outcome_exit_price = stop_price
 WHERE symbol = 'PNBHOUSING'
   AND status = 'active'
   AND outcome_locked IS NULL
   AND stop_price IS NOT NULL;
