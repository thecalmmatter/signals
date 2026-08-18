// Optional push notification for events that need the admin's attention —
// currently just an unmapped Chartlink scan landing in the review queue.
// Silently no-ops if TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID aren't set; this
// is opt-in and must never break the caller (e.g. the Chartlink webhook) if
// Telegram is slow or down.
//
// Setup: message @BotFather on Telegram, /newbot, copy the token it gives
// you into TELEGRAM_BOT_TOKEN. Then message your new bot once (anything),
// and GET https://api.telegram.org/bot<token>/getUpdates to find your
// chat.id — that's TELEGRAM_CHAT_ID.

export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

export async function sendTelegramMessage(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

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
      console.error("[telegram] sendMessage failed", res.status, body.slice(0, 300));
    }
  } catch (error) {
    console.error("[telegram] sendMessage error (non-fatal, continuing)", error);
  } finally {
    clearTimeout(timeout);
  }
}
