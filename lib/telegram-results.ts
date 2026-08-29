// Broadcasts a signal's outcome (target hit / stopped) to a public Telegram
// results channel the moment lib/live-signals.ts first detects it. This is
// the product's honesty positioning made literal — every call that closes
// gets posted, wins and losses both, nothing curated after the fact. It's
// deliberately results-only (not a live mirror of the app's actionable
// feed): posting closed outcomes builds public trust/track record without
// giving away the live, actionable tool for free — see the strategy
// discussion this was built from.
//
// Reuses the Telegram Ads lead-capture bot (TELEGRAM_LEADS_BOT_TOKEN) rather
// than a third bot — it's already the public-facing one. Add it as an admin
// to your results channel with permission to post messages.
//
// TELEGRAM_RESULTS_CHANNEL_ID:
//  - Public channel: just "@yourchannelusername".
//  - Private channel: the numeric chat id (looks like "-100xxxxxxxxxx") —
//    add the bot as admin, post any message in the channel, then
//    GET https://api.telegram.org/bot<token>/getUpdates to find it.

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 1 })}`;

// HTML-escape user/DB-derived text before dropping it into a parse_mode:
// "HTML" message — symbol names are admin-controlled, not public input, but
// escaping costs nothing and avoids a malformed message if one ever contains
// &, <, or >.
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function isResultsChannelConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_LEADS_BOT_TOKEN && process.env.TELEGRAM_RESULTS_CHANNEL_ID);
}

// Shared by both the instant post (this file) and the periodic digest
// (lib/telegram-digest.ts) so a channel scroll reads consistently — same
// bot, same chat_id, same parse_mode.
export async function sendResultsChannelMessage(text: string): Promise<void> {
  const token = process.env.TELEGRAM_LEADS_BOT_TOKEN;
  const channelId = process.env.TELEGRAM_RESULTS_CHANNEL_ID;
  if (!token || !channelId) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: channelId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[telegram-results] sendMessage failed", res.status, body.slice(0, 300));
    }
  } catch (error) {
    console.error("[telegram-results] sendMessage error (non-fatal, continuing)", error);
  } finally {
    clearTimeout(timeout);
  }
}

export async function announceOutcome(params: {
  symbol: string;
  outcome: "target_hit" | "stopped";
  signal: "buy" | "sell" | "watch";
  entry: number | null;
  exitPrice: number;
  daysIn: number;
}): Promise<void> {
  if (!isResultsChannelConfigured()) return;

  const { symbol, outcome, signal, entry, exitPrice, daysIn } = params;
  // Green for a win, red for a loss — the whole point of posting both kinds
  // unfiltered is that the color makes the mix honest at a glance.
  const dot = outcome === "target_hit" ? "🟢" : "🔴";
  const label = outcome === "target_hit" ? "TARGET HIT" : "STOPPED";

  let returnPart = "";
  if (entry && entry > 0) {
    const raw = ((exitPrice - entry) / entry) * 100;
    const pct = signal === "sell" ? -raw : raw;
    returnPart = ` (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)`;
  }
  const entryPart = entry && entry > 0 ? `Entry ${inr(entry)} → ${inr(exitPrice)}` : `Closed at ${inr(exitPrice)}`;
  const text = `${dot} <b>${esc(symbol)}</b> — ${label}\n${entryPart}${returnPart} · ${daysIn} day${daysIn === 1 ? "" : "s"} in`;

  await sendResultsChannelMessage(text);
}
