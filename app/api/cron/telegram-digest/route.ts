import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { postDigestIfDue, postSnapshotIfDue } from "@/lib/telegram-digest";

export const dynamic = "force-dynamic";

// Triggered by the Vercel Cron entry in vercel.json (once/day on Hobby).
// Checks two independent periodic posts (see lib/telegram-digest.ts):
// closed-since-last-post summary (DIGEST_INTERVAL_HOURS) and the
// symbol/return/days snapshot table (SNAPSHOT_INTERVAL_HOURS) — either can
// have a longer effective cadence than the daily trigger, set via env var,
// no redeploy needed.
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

  const pool = getPool();

  // Two independent posts, each gated on its own schedule/state (see
  // lib/telegram-digest.ts) — one failing never blocks the other.
  let closedSummary: { posted: boolean; count: number } | { error: string };
  try {
    closedSummary = await postDigestIfDue(pool);
  } catch (error) {
    console.error("GET /api/cron/telegram-digest: closed summary failed", error);
    closedSummary = { error: "closed summary check failed" };
  }

  let snapshot: { posted: boolean; count: number } | { error: string };
  try {
    snapshot = await postSnapshotIfDue(pool);
  } catch (error) {
    console.error("GET /api/cron/telegram-digest: snapshot failed", error);
    snapshot = { error: "snapshot check failed" };
  }

  return NextResponse.json({ closedSummary, snapshot });
}
