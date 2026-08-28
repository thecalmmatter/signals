import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { getPool } from "@/lib/db";
import { getAdminUserId } from "@/lib/admin";

export const dynamic = "force-dynamic";

const json = (body: unknown, status: number) => NextResponse.json(body, { status });

// Blocks (or unblocks) a waitlist email from ever being invited again.
//
// Blocking best-effort revokes any pending Clerk invitation for that email
// so the invite link they may already have stops working — per Clerk's own
// docs, revoking only disables that link, it does NOT stop the person from
// signing up on their own if the Clerk app's Access mode is "Open" rather
// than "Invite-only" (see README §7). This is the closest thing to "block
// their access" available before they've actually signed up; once they're
// a real user, use the Delete action on the User management page instead.
export async function POST(req: Request) {
  const adminId = await getAdminUserId();
  if (!adminId) return json({ error: "forbidden" }, 403);

  let body: { email?: unknown; block?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) return json({ error: "email is required" }, 400);
  const block = body.block !== false; // default true — this route is mainly for blocking

  let revokedCount = 0;
  let clerkWarning: string | null = null;

  if (block) {
    try {
      const client = await clerkClient();
      const { data } = await client.invitations.getInvitationList({ query: email, status: "pending" });
      for (const invitation of data) {
        try {
          await client.invitations.revokeInvitation(invitation.id);
          revokedCount += 1;
        } catch (error) {
          console.error(`POST /api/admin/waitlist/block: failed to revoke invitation ${invitation.id}`, error);
        }
      }
    } catch (error) {
      console.error("POST /api/admin/waitlist/block: failed to look up pending invitations", error);
      clerkWarning =
        "Marked as blocked locally, but couldn't reach Clerk to revoke any pending invite link — " +
        (error instanceof Error ? error.message : "unknown error");
    }
  }

  await getPool().query(
    `UPDATE waitlist_signups SET blocked_at = ${block ? "now()" : "NULL"} WHERE email = $1`,
    [email]
  );

  return json({ ok: true, email, blocked: block, revokedCount, clerkWarning }, 200);
}
