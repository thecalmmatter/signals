-- Fix for signals that got locked as target_hit (and thus shown as "Closed")
-- the moment ANY configured target (e.g. T1 of a T1/T2/T3 ladder) was hit,
-- instead of only the furthest one — see computeOutcome() in
-- lib/live-signals.ts. A trade with T2/T3 still ahead of it isn't done just
-- because T1 printed; it needs to go back to "open" (live-evaluated) so it
-- can keep running towards T2/T3, or get correctly marked "stopped" if price
-- later reverses through the stop instead.
--
-- Detects a "premature" lock by comparing the frozen outcome_exit_price
-- against the furthest configured target: if the exit price never actually
-- reached that furthest target, the lock happened on an earlier one and
-- needs to be undone.
--
-- Safe to run multiple times — only touches rows that still need it.

UPDATE signals
   SET outcome_locked = NULL,
       outcome_locked_at = NULL,
       outcome_exit_price = NULL
 WHERE outcome_locked = 'target_hit'
   AND outcome_exit_price IS NOT NULL
   AND (
     (
       signal_type = 'buy'
       AND outcome_exit_price < GREATEST(
             COALESCE(target_price, -1e18),
             COALESCE(target_price_2, -1e18),
             COALESCE(target_price_3, -1e18)
           )
     )
     OR
     (
       signal_type = 'sell'
       AND outcome_exit_price > LEAST(
             COALESCE(target_price, 1e18),
             COALESCE(target_price_2, 1e18),
             COALESCE(target_price_3, 1e18)
           )
     )
   );
