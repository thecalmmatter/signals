-- Waitlist capture for the standalone /waitlist landing page (community
-- posting: Reddit, Telegram, Discord, etc.). Idempotent — safe to re-run.
--
-- One row per email. `source` is whatever ?src= was on the link that
-- brought them in (e.g. "reddit-algotrading", "telegram-swing-traders"),
-- so the admin panel can show which community actually converts. NULL
-- source just means they landed on /waitlist with no query param.

CREATE TABLE IF NOT EXISTS waitlist_signups (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email       TEXT NOT NULL,
    source      TEXT,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT waitlist_signups_email_key UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS waitlist_signups_created_at_idx ON waitlist_signups (created_at);
CREATE INDEX IF NOT EXISTS waitlist_signups_source_idx ON waitlist_signups (source);

COMMENT ON TABLE waitlist_signups IS
  'Email capture from /waitlist. source tracks which community link (?src=...) drove the signup. No email is sent automatically — the admin panel lists signups for manual follow-up.';
