import type { ChatMessage, LlmProvider, StockChatContext } from "../types";
import { LlmError } from "../types";
import { buildSystemPrompt } from "../prompt";

// Factory for any provider that speaks the OpenAI chat-completions shape —
// covers DeepSeek, GLM (Zhipu), and most other hosted-model APIs, so adding
// one more provider is a ~5-line config object, not a new HTTP client.
export function createOpenAiCompatibleProvider(opts: {
  name: string;
  baseUrl: string; // e.g. "https://api.deepseek.com" (no trailing slash)
  apiKeyEnv: string;
  modelEnv: string;
  defaultModel: string;
  // Extra fields merged into the request body — for provider-specific
  // knobs that don't fit the shared shape (e.g. GLM's "thinking" mode,
  // which defaults on for newer models and otherwise eats the whole
  // max_tokens budget on reasoning before ever emitting `content`).
  extraBody?: Record<string, unknown>;
}): LlmProvider {
  // Free-tier hosted models (GLM's flash tier especially) return 429 under
  // shared load fairly often, and it usually clears within a second or two.
  // A couple of short backoff retries turns most of those into a success
  // instead of a user-facing error.
  const RETRY_DELAYS_MS = [600, 1500];

  return {
    name: opts.name,
    async ask(ctx: StockChatContext, messages: ChatMessage[]): Promise<string> {
      const apiKey = process.env[opts.apiKeyEnv];
      if (!apiKey) throw new LlmError(`${opts.apiKeyEnv} not configured`);

      const model = process.env[opts.modelEnv] ?? opts.defaultModel;
      const body = JSON.stringify({
        model,
        max_tokens: 300,
        messages: [
          { role: "system", content: buildSystemPrompt(ctx) },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
        ...opts.extraBody,
      });

      let lastError: LlmError | null = null;
      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        const res = await fetch(`${opts.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body,
        });

        if (res.ok) {
          const data = (await res.json()) as {
            choices?: { message?: { content?: string; reasoning_content?: string } }[];
          };
          // Reasoning-capable models (e.g. GLM with thinking enabled) can
          // put the real answer in reasoning_content if content is empty.
          const text =
            data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning_content;
          if (!text) throw new LlmError(`${opts.name} returned no message content`);
          return text;
        }

        if (res.status === 429 && attempt < RETRY_DELAYS_MS.length) {
          await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
          continue;
        }

        const detail = await res.text().catch(() => "");
        const err = new LlmError(`${opts.name} ${res.status}: ${detail.slice(0, 300)}`);
        err.rateLimited = res.status === 429;
        lastError = err;
        break;
      }

      throw lastError ?? new LlmError(`${opts.name} request failed`);
    },
  };
}
