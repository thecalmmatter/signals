import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

// Public route (no auth) — this is the landing point for cold traffic from
// community posts, so anyone can submit. No email is sent from here; this
// just records the signup. See scripts/migration_waitlist.sql.

export const dynamic = "force-dynamic";

const json = (body: unknown, status: number) => NextResponse.json(body, { status });

// Deliberately simple — good enough to reject garbage input, not a full
// RFC 5322 validator.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  let body: { email?: unknown; source?: unknown; company?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  // Honeypot: a real visitor never fills this hidden field in; a bot
  // filling every field usually does. Pretend success without writing
  // anything, so scrapers don't learn it's a trap.
  if (typeof body.company === "string" && body.company.trim() !== "") {
    return json({ ok: true }, 200);
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !EMAIL_RE.test(email)) {
    return json({ error: "enter a valid email" }, 400);
  }

  const source =
    typeof body.source === "string" && body.source.trim() ? body.source.trim().slice(0, 100) : null;
  const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null;

  try {
    const result = await getPool().query(
      `INSERT INTO waitlist_signups (email, source, user_agent)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [email, source, userAgent]
    );
    return json({ ok: true, alreadyOnList: result.rows.length === 0 }, 201);
  } catch (error) {
    console.error("POST /api/waitlist failed — is scripts/migration_waitlist.sql applied?", error);
    return json({ error: "could not save signup" }, 500);
  }
}
