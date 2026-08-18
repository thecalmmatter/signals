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
