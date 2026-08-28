import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getAdminUserId } from "@/lib/admin";

export const dynamic = "force-dynamic";

const json = (body: unknown, status: number) => NextResponse.json(body, { status });

// Removes a waitlist entry entirely — local bookkeeping only, never touches
// Clerk. Use this for spam/duplicate/unwanted signups. If the email was
// already invited via Clerk, that invitation link stays valid until it
// expires or is revoked (see POST /api/admin/waitlist/block) — deleting the
// row here does not revoke it.
export async function DELETE(req: Request) {
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

  const result = await getPool().query(`DELETE FROM waitlist_signups WHERE email = $1`, [email]);
  if (result.rowCount === 0) return json({ error: "not found" }, 404);

  return json({ ok: true, email }, 200);
}
