-- Tracks which waitlist signups have actually been sent a Clerk invitation
-- (Access mode = Invite-only in the Clerk dashboard — see README §7).
-- Idempotent — safe to re-run.
--
-- Being on waitlist_signups no longer implies access; invited_at is set only
-- when the admin clicks "Invite" in /dashboard/admin, which calls Clerk's
-- invitations API. NULL = not invited yet.

ALTER TABLE waitlist_signups ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ;

COMMENT ON COLUMN waitlist_signups.invited_at IS
  'Set when the admin sends a Clerk invitation for this email from /dashboard/admin. NULL = still just an interest signup, not invited.';
