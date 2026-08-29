import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { postDigestIfDue } from "@/lib/telegram-digest";

export const dynamic = "force-dynamic";

// Triggered by the Vercel Cron entry in vercel.json (once/day on Hobby —
// see scripts/migration_telegram_digest.sql and lib/telegram-digest.ts for
// how DIGEST_INTERVAL_HOURS still lets the *actual* posting cadence be
// longer than that without a redeploy).
//
// Auth: Vercel automatically sends "Authorization: Bearer <CRON_SECRET>" on
// requests it generates for a cron job, as long as CRON_SECRET is set as a
// project env var — https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs.
// Also accepts a manual "?token=<CRON_SECRET>" query param so an admin can
// trigger a digest check by hand (e.g. right after changing
// DIGEST_INTERVAL_HOURS) without waiting for the schedule.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = req.headers.get("authorization");
    const queryToken = new URL(req.url).searchParams.get("token");
    const ok = authHeader === `Bearer ${secret}` || queryToken === secret;
    if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const result = await postDigestIfDue(getPool());
    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/cron/telegram-digest failed", error);
    return NextResponse.json({ error: "digest check failed" }, { status: 500 });
  }
}
