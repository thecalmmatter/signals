-- Periodic Telegram results digest — a "symbols + overall return since last
-- post" summary, separate from the instant per-close post in
-- lib/telegram-results.ts. Two pieces:
--
-- 1. signals.outcome_exit_price: the live price at the exact moment a signal
--    got locked to stopped/target_hit (lib/live-signals.ts). Without this,
--    a closed signal's "return" would keep drifting with the live quote
--    forever, which is wrong for a trade that's actually over — the digest
--    needs a frozen number.
--
-- 2. telegram_digest_state: a single-row table (id is always TRUE, enforced
--    by the CHECK) tracking when the digest last actually posted something.
--    The digest cron (app/api/cron/telegram-digest/route.ts) only advances
--    this timestamp when it finds something to report — a quiet stretch with
--    no closes just keeps checking against the same last_posted_at until
--    something closes, rather than posting an empty "nothing happened" message.

ALTER TABLE signals ADD COLUMN IF NOT EXISTS outcome_exit_price NUMERIC;

COMMENT ON COLUMN signals.outcome_exit_price IS
  'Live price at the moment outcome_locked was first set. Frozen — never updated again. Powers the Telegram results digest''s per-symbol return calculation.';

CREATE TABLE IF NOT EXISTS telegram_digest_state (
    id             BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
    last_posted_at TIMESTAMPTZ
);

INSERT INTO telegram_digest_state (id, last_posted_at)
VALUES (true, NULL)
ON CONFLICT (id) DO NOTHING;
