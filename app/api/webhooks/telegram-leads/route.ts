import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { sendLeadsBotMessage } from "@/lib/telegram-leads";
import { getResultsChannelUrl } from "@/lib/telegram-results";

export const dynamic = "force-dynamic";

// Telegram Update shape — only the fields this route actually reads.
type TelegramUpdate = {
  message?: {
    message_id: number;
    chat: { id: number };
    from?: { id: number; username?: string; first_name?: string };
    text?: string;
  };
};

// SITE_URL must be set to the real production domain — deliberately not
// hardcoded/guessed here, since a wrong domain baked into every welcome
// message would silently send every lead to a broken link.
function welcomeText(): string {
  const siteUrl = process.env.SITE_URL?.replace(/\/$/, "");
  const signupLine = siteUrl
    ? `Sign up here: ${siteUrl}/signup`
    : "Sign up on the Signals dashboard (ask the admin for the link — SITE_URL isn't configured yet).";

  // Someone who tapped a Telegram Ad is mid-Telegram-flow, not mid-browser —
  // the channel is a lighter-weight ask than "go sign up on a website", and
  // it's proof (a public, unfiltered track record) before they've committed
  // to anything. Without this line there was no path from the bot to the
  // channel at all; a lead only ever saw the signup link. See README §11.
  const channelUrl = getResultsChannelUrl();
  const channelLine = channelUrl
    ? `\n\nWant proof first? Every call's outcome — wins and losses both — gets posted live here: ${channelUrl}`
    : "";

  return (
    "Thanks for stopping by 👋\n\n" +
    "Signals publishes swing setups on NSE large-caps — entry, target, stop, one clean card. " +
    "Free during the public dry run, no card needed.\n\n" +
    `${signupLine}${channelLine}\n\n` +
    "(Not financial advice — a technical setup format, trade your own risk.)"
  );
}

// Public webhook — Telegram calls this, so it's authenticated by the secret
// token Telegram echoes back on every request (set once via setWebhook's
// secret_token param), not by session/admin auth. See lib/telegram-leads.ts
// for the setWebhook command.
export async function POST(req: Request) {
  const expected = process.env.TELEGRAM_LEADS_WEBHOOK_SECRET;
  const got = req.headers.get("x-telegram-bot-api-secret-token");
  if (!expected || got !== expected) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true }); // Telegram doesn't care about the body, just a 200
  }

  const msg = update.message;
  if (!msg?.from || !msg.text) return NextResponse.json({ ok: true });

  // Only /start (with or without a deep-link payload) creates/updates a
  // lead — other messages are acknowledged but not logged, so someone
  // chatting with the bot after joining doesn't spam duplicate rows.
  const match = msg.text.match(/^\/start(?:\s+(\S+))?/);
  if (!match) {
    await sendLeadsBotMessage(msg.chat.id, "Hit /start to get set up.");
    return NextResponse.json({ ok: true });
  }

  const startParam = match[1] ?? null;
  const { id: telegramUserId, username, first_name: firstName } = msg.from;

  try {
    await getPool().query(
      `INSERT INTO telegram_leads (telegram_user_id, username, first_name, start_param)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (telegram_user_id) DO UPDATE SET
         username = EXCLUDED.username,
         first_name = EXCLUDED.first_name,
         -- Keep the first start_param a returning user ever came in on,
         -- rather than overwriting attribution on every re-start.
         start_param = coalesce(telegram_leads.start_param, EXCLUDED.start_param)`,
      [telegramUserId, username ?? null, firstName ?? null, startParam]
    );
  } catch (error) {
    console.error("telegram-leads webhook: failed to log lead (run scripts/migration_telegram_leads.sql?)", error);
  }

  await sendLeadsBotMessage(msg.chat.id, welcomeText());
  return NextResponse.json({ ok: true });
}
