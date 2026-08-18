import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getAdminUserId } from "@/lib/admin";

export const dynamic = "force-dynamic";

const json = (body: unknown, status: number) => NextResponse.json(body, { status });

export async function GET() {
  const adminId = await getAdminUserId();
  if (!adminId) return json({ error: "forbidden" }, 403);

  const { rows } = await getPool().query<{ default_trial_ends_at: string | null }>(
    "SELECT default_trial_ends_at FROM app_settings WHERE id = 1"
  );
  return json({ defaultTrialEndsAt: rows[0]?.default_trial_ends_at ?? null }, 200);
}

// Global dry-run cutoff applied to every user without a personal
// trial_ends_at override. Pass null to clear it (unlimited trial for anyone
// not individually set).
export async function PATCH(req: Request) {
  const adminId = await getAdminUserId();
  if (!adminId) return json({ error: "forbidden" }, 403);

  let body: { defaultTrialEndsAt?: string | null };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  if (body.defaultTrialEndsAt !== null && body.defaultTrialEndsAt !== undefined) {
    if (Number.isNaN(new Date(body.defaultTrialEndsAt).getTime())) {
      return json({ error: "invalid defaultTrialEndsAt" }, 400);
    }
  }

  await getPool().query(
    `INSERT INTO app_settings (id, default_trial_ends_at, updated_at)
     VALUES (1, $1, now())
     ON CONFLICT (id) DO UPDATE SET default_trial_ends_at = $1, updated_at = now()`,
    [body.defaultTrialEndsAt ?? null]
  );

  return json({ ok: true }, 200);
}
