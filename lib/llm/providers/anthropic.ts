import type { ChatMessage, LlmProvider, StockChatContext } from "../types";
import { LlmError } from "../types";
import { buildSystemPrompt } from "../prompt";

export const anthropicProvider: LlmProvider = {
  name: "anthropic",
  async ask(ctx: StockChatContext, messages: ChatMessage[]): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new LlmError("ANTHROPIC_API_KEY not configured");

    const model = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 300,
        system: buildSystemPrompt(ctx),
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new LlmError(`anthropic ${res.status}: ${detail.slice(0, 300)}`);
    }

    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((b) => b.type === "text")?.text;
    if (!text) throw new LlmError("anthropic returned no text content");
    return text;
  },
};
