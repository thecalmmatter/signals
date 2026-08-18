import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getActiveProvider, LlmError, type ChatMessage, type StockChatContext } from "@/lib/llm";
import { getAccessStatus } from "@/lib/access";

export const dynamic = "force-dynamic";

const json = (body: unknown, status: number) => NextResponse.json(body, { status });

const MAX_MESSAGES = 12; // cap history sent per request (short thread, no pagination)
const MAX_MESSAGE_LEN = 1000;

function isSignal(v: unknown): v is StockChatContext["signal"] {
  return v === "buy" || v === "sell" || v === "watch";
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ symbol: string }> }
) {
  const { userId } = await auth();
  if (!userId) return json({ error: "unauthorized" }, 401);
  const access = await getAccessStatus(userId);
  if (!access.allowed) return json({ error: "subscription required" }, 402);

  const { symbol: rawSymbol } = await ctx.params;
  const symbol = rawSymbol.trim().toUpperCase();
  if (!symbol) return json({ error: "symbol is required" }, 400);

  let body: {
    messages?: ChatMessage[];
    context?: Partial<StockChatContext>;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const context = body.context;
  if (
    !context ||
    typeof context.name !== "string" ||
    !isSignal(context.signal) ||
    typeof context.price !== "number" ||
    typeof context.entry !== "number" ||
    typeof context.target !== "number" ||
    typeof context.stop !== "number" ||
    typeof context.daysToExit !== "number"
  ) {
    return json({ error: "invalid or missing stock context" }, 400);
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) return json({ error: "messages is required" }, 400);

  const cleaned: ChatMessage[] = messages
    .slice(-MAX_MESSAGES)
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_LEN) }));

  if (cleaned.length === 0 || cleaned[cleaned.length - 1].role !== "user") {
    return json({ error: "last message must be from the user" }, 400);
  }

  try {
    const provider = getActiveProvider();
    const reply = await provider.ask({ ...context, symbol } as StockChatContext, cleaned);
    return NextResponse.json({ reply, provider: provider.name });
  } catch (error) {
    console.error(`POST /api/stocks/${symbol}/chat failed`, error);
    if (error instanceof LlmError && error.rateLimited) {
      return json(
        { error: "rate limited", detail: "The assistant is busy right now — try again in a few seconds." },
        429
      );
    }
    const detail = error instanceof Error ? error.message : String(error);
    return json({ error: "chat failed", detail }, 502);
  }
}
