// Shared types for the pluggable "ask about this stock" chat. Any provider
// (Anthropic, DeepSeek, GLM, ..., eventually a custom model) implements
// LlmProvider against the same context/message shape so swapping providers
// is a config change, not a rewrite.

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type StockChatContext = {
  symbol: string;
  name: string;
  signal: "buy" | "sell" | "watch";
  price: number;
  entry: number;
  target: number;
  stop: number;
  daysToExit: number;
  rsi?: {
    weekly?: { latest: number; rising: boolean; above60: boolean } | null;
    daily?: { latest: number; rising: boolean; above60: boolean } | null;
    hourly?: { latest: number; rising: boolean; above60: boolean } | null;
    m15?: { latest: number; rising: boolean; above60: boolean } | null;
  };
};

export interface LlmProvider {
  name: string;
  ask(ctx: StockChatContext, messages: ChatMessage[]): Promise<string>;
}

export class LlmError extends Error {
  // Set when the failure is a rate limit (HTTP 429) — lets callers show a
  // "busy, try again" message instead of a raw upstream error dump.
  rateLimited?: boolean;
}
