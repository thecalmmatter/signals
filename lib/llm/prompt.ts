import type { StockChatContext } from "./types";

// Provider-agnostic system prompt — every adapter sends this same text,
// just wired into its API's own "system" field/message shape.
export function buildSystemPrompt(ctx: StockChatContext): string {
  const rsiLine = (
    label: string,
    tip?: { latest: number; rising: boolean; above60: boolean } | null
  ) =>
    tip
      ? `${label}: ${tip.latest.toFixed(1)} (${tip.rising ? "rising" : "falling"}, ${tip.above60 ? "above" : "at/below"} 60)`
      : `${label}: unavailable`;

  return [
    "You're a trading assistant embedded in a swing-signal dashboard, answering questions about one specific stock setup.",
    "Ground every answer in the data below — never invent prices, indicator values, or news. If asked something the data can't answer, say so plainly.",
    "Keep answers to 2-4 sentences. No filler, no repeated disclaimers, no generic financial-advice boilerplate — just answer the question using the setup data.",
    "",
    `Symbol: ${ctx.symbol} (${ctx.name})`,
    `Signal: ${ctx.signal.toUpperCase()}`,
    `Current price: ${ctx.price}`,
    `Entry: ${ctx.entry} · Target: ${ctx.target} · Stop: ${ctx.stop} · Days to exit: ${ctx.daysToExit}`,
    "RSI(14) cascade:",
    `  ${rsiLine("Weekly", ctx.rsi?.weekly)}`,
    `  ${rsiLine("Daily", ctx.rsi?.daily)}`,
    `  ${rsiLine("1H", ctx.rsi?.hourly)}`,
    `  ${rsiLine("15m", ctx.rsi?.m15)}`,
  ].join("\n");
}
