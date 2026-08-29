-- Adds a second, independent periodic Telegram post: a compact symbol /
-- return / days snapshot table of every currently-active signal (open,
-- stopped, and target-hit alike) — separate from the "closed since last
-- digest" summary in scripts/migration_telegram_digest.sql. Both need their
-- own last-posted timestamp, so telegram_digest_state moves from a single
-- fixed row (id boolean, always true) to one row per kind.

ALTER TABLE telegram_digest_state ADD COLUMN IF NOT EXISTS kind TEXT;
UPDATE telegram_digest_state SET kind = 'closed_summary' WHERE kind IS NULL;
ALTER TABLE telegram_digest_state ALTER COLUMN kind SET NOT NULL;
ALTER TABLE telegram_digest_state DROP CONSTRAINT IF EXISTS telegram_digest_state_pkey;
ALTER TABLE telegram_digest_state DROP COLUMN IF EXISTS id;
ALTER TABLE telegram_digest_state ADD PRIMARY KEY (kind);

INSERT INTO telegram_digest_state (kind, last_posted_at)
VALUES ('snapshot', NULL)
ON CONFLICT (kind) DO NOTHING;

COMMENT ON TABLE telegram_digest_state IS
  'One row per periodic Telegram post kind (''closed_summary'', ''snapshot''), tracking when each last actually posted. See lib/telegram-digest.ts.';
