-- Lets an admin block a waitlist entry so it's never invited/re-invited by
-- accident, and remembers the block even if the person is removed and later
-- re-submits the /waitlist form with the same email.

ALTER TABLE waitlist_signups ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;

COMMENT ON COLUMN waitlist_signups.blocked_at IS
  'Set by an admin via the Block action. When set, any pending Clerk invitation for this email was best-effort revoked, and the Invite/Re-invite button is disabled. NULL = not blocked.';
