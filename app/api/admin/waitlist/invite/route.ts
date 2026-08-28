import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { getPool } from "@/lib/db";
import { getAdminUserId } from "@/lib/admin";

export const dynamic = "force-dynamic";

const json = (body: unknown, status: number) => NextResponse.json(body, { status });

// Sends a real Clerk invitation for a waitlist email, then marks it invited.
// Only meaningful once the Clerk app's Access mode is set to "Invite-only"
// in the Clerk dashboard — otherwise anyone can already sign up unprompted
// and this button is just a courtesy email. See README §7.
export async function POST(req: Request) {
  const adminId = await getAdminUserId();
  if (!adminId) return json({ error: "forbidden" }, 403);

  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) return json({ error: "email is required" }, 400);

  const blockedCheck = await getPool()
    .query(`SELECT blocked_at FROM waitlist_signups WHERE email = $1`, [email])
    .catch(() => null); // blocked_at column may not exist yet — fail open, same as before this feature
  if (blockedCheck?.rows[0]?.blocked_at) {
    return json({ error: "this email is blocked — unblock it first" }, 400);
  }

  try {
    const client = await clerkClient();
    await client.invitations.createInvitation({
      emailAddress: email,
      // Don't error out if this email was already invited before —
      // re-inviting (e.g. after an expired invite) should just work.
      ignoreExisting: true,
    });
  } catch (error) {
    console.error("POST /api/admin/waitlist/invite: Clerk invitation failed", error);
    const message = error instanceof Error ? error.message : "Clerk invitation failed";
    return json({ error: message }, 502);
  }

  try {
    await getPool().query(
      `UPDATE waitlist_signups SET invited_at = now() WHERE email = $1`,
      [email]
    );
  } catch (error) {
    // Invitation already went out via Clerk even if this bookkeeping update
    // fails — log it but don't report failure to the admin for something
    // that already succeeded on Clerk's side.
    console.error("POST /api/admin/waitlist/invite: failed to record invited_at", error);
  }

  return json({ ok: true, email }, 200);
}
