// Dedicated bot for the Telegram Ads lead-capture funnel — @SignalsLeadsBot,
// a separate bot/token from TELEGRAM_BOT_TOKEN (which only ever sends
// outbound admin alerts and never receives updates). This one has a
// webhook (app/api/webhooks/telegram-leads/route.ts) so it can actually
// reply when someone taps the ad's deep link and hits Start.
//
// Setup: message @BotFather -> /newbot, then set TELEGRAM_LEADS_BOT_TOKEN.
// After deploying, register the webhook once:
//   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<domain>/api/webhooks/telegram-leads&secret_token=<TELEGRAM_LEADS_WEBHOOK_SECRET>"

import { getPool } from "./db";

export function isTelegramLeadsConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_LEADS_BOT_TOKEN);
}

export async function sendLeadsBotMessage(chatId: number, text: string): Promise<void> {
  const token = process.env.TELEGRAM_LEADS_BOT_TOKEN;
  if (!token) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[telegram-leads] sendMessage failed", res.status, body.slice(0, 300));
    }
  } catch (error) {
    console.error("[telegram-leads] sendMessage error (non-fatal, continuing)", error);
  } finally {
    clearTimeout(timeout);
  }
}

export type TelegramLead = {
  telegramUserId: string;
  username: string | null;
  firstName: string | null;
  startParam: string | null;
  createdAt: string;
};

// Admin view (app/dashboard/admin/users) — degrades to an empty list rather
// than a hard 500 if the migration hasn't been applied yet.
export async function loadTelegramLeads(): Promise<TelegramLead[]> {
  try {
    const { rows } = await getPool().query(
      `SELECT telegram_user_id, username, first_name, start_param, created_at
         FROM telegram_leads
        ORDER BY created_at DESC
        LIMIT 200`
    );
    return rows.map((r) => ({
      telegramUserId: String(r.telegram_user_id),
      username: r.username as string | null,
      firstName: r.first_name as string | null,
      startParam: r.start_param as string | null,
      createdAt: new Date(r.created_at as string).toISOString(),
    }));
  } catch (error) {
    console.error("loadTelegramLeads failed (run scripts/migration_telegram_leads.sql?)", error);
    return [];
  }
}
