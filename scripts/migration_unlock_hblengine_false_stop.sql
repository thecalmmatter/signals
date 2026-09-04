-- URGENT one-off correction: HBLENGINE was wrongly locked "stopped" in
-- production by the day-low/day-high fix in the immediately preceding
-- commit, before the enteredToday guard (this commit) existed. Its entry
-- (₹701) triggered AFTER the day's low of ₹667 already printed earlier that
-- same session -- the stop (₹676) was never actually touched by a trade
-- that was open at the time. Reported by the user within minutes of the
-- false lock; root-caused and fixed in the same sitting.
--
-- Run this ONCE, immediately, ahead of the other pending migrations —
-- it just clears a bad lock so the (now-fixed) live code can re-evaluate
-- HBLENGINE correctly on the next page load.

UPDATE signals
   SET outcome_locked = NULL,
       outcome_locked_at = NULL,
       outcome_exit_price = NULL
 WHERE symbol = 'HBLENGINE'
   AND status = 'active'
   AND outcome_locked = 'stopped';
