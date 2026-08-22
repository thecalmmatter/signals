import type { LlmProvider } from "./types";
import { LlmError } from "./types";
import { anthropicProvider } from "./providers/anthropic";
import { createOpenAiCompatibleProvider } from "./providers/openai-compatible";

// Provider registry. Adding a new hosted model = one more entry here (or a
// new file under providers/ if its API isn't OpenAI-compatible). The active
// provider is chosen at request time by LLM_PROVIDER — swapping models,
// including eventually a self-hosted/custom one, is a config change.
const PROVIDERS: Record<string, LlmProvider> = {
  anthropic: anthropicProvider,
  deepseek: createOpenAiCompatibleProvider({
    name: "deepseek",
    baseUrl: "https://api.deepseek.com",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    modelEnv: "DEEPSEEK_MODEL",
    defaultModel: "deepseek-chat",
  }),
  glm: createOpenAiCompatibleProvider({
    name: "glm",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    apiKeyEnv: "GLM_API_KEY",
    modelEnv: "GLM_MODEL",
    defaultModel: "glm-4.7-flash",
    // GLM-4.7-Flash has thinking mode on by default; with our small
    // max_tokens budget the reasoning phase can eat the whole thing before
    // any final content is emitted. Disable it — this is a quick grounded
    // Q&A feature, not a reasoning task.
    extraBody: { thinking: { type: "disabled" } },
  }),
  // Self-hosted Kimi K3 on Modal (OpenAI-compatible endpoint). Model id
  // confirmed via GET {base}/v1/models -> "moonshotai/Kimi-K3".
  kimi: createOpenAiCompatibleProvider({
    name: "kimi",
    baseUrl: "https://mattercalm--ep-kimi-k3-server.us-west.modal.direct/v1",
    apiKeyEnv: "KIMI_API_KEY",
    modelEnv: "KIMI_MODEL",
    defaultModel: "moonshotai/Kimi-K3",
    // K3 is a reasoning model (reasoning_content field, effort levels
    // low/high/max per its /v1/models listing) — same risk GLM had: the
    // reasoning phase can eat the whole max_tokens budget before any
    // `content` is emitted. openai-compatible.ts already falls back to
    // reasoning_content if content is empty, so this works either way.
    // Not setting an effort param here — the exact request field name for
    // it isn't confirmed (guessing wrong could just get ignored, or 400 on
    // a stricter server). Test a real call first; if answers come back
    // empty/slow, that's the next thing to fix, with the real field name
    // confirmed from a live request/response, not guessed.
  }),
};

export function getActiveProvider(): LlmProvider {
  const key = (process.env.LLM_PROVIDER ?? "anthropic").trim().toLowerCase();
  const provider = PROVIDERS[key];
  if (!provider) {
    throw new LlmError(
      `unknown LLM_PROVIDER "${key}" — expected one of: ${Object.keys(PROVIDERS).join(", ")}`
    );
  }
  return provider;
}

export { LlmError };
export type { ChatMessage, StockChatContext, LlmProvider } from "./types";
