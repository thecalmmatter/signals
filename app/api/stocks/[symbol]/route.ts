import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCandles, rsi14, rsiTip, resampleWeekly } from "@/lib/fyers";
import { getAccessStatus } from "@/lib/access";

export const dynamic = "force-dynamic";

const json = (body: unknown, status: number) => NextResponse.json(body, { status });

// Fyers history caps: daily resolution ≤366 days/request, intraday ≤100
// days/request. Weekly has no native resolution — derived from the daily
// series (see resampleWeekly), so one daily fetch covers both.
const DAILY_LOOKBACK_DAYS = 365;
const HOURLY_LOOKBACK_DAYS = 20;
const M15_LOOKBACK_DAYS = 5;
const CHART_DAYS = 90; // slice of the daily series shown in the splash

type CacheEntry = { at: number; data: unknown };
const CACHE = new Map<string, CacheEntry>();
const TTL_MS = 45_000;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ symbol: string }> }
) {
  const { userId } = await auth();
  if (!userId) return json({ error: "unauthorized" }, 401);
  const access = await getAccessStatus(userId);
  if (!access.allowed) return json({ error: "subscription required" }, 402);

  const { symbol: rawSymbol } = await ctx.params;
  const symbol = rawSymbol.trim().toUpperCase();
  if (!symbol) return json({ error: "symbol is required" }, 400);

  const cacheKey = symbol;
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() - cached.at < TTL_MS) {
    return NextResponse.json(cached.data);
  }

  try {
    const [daily, hourly, m15] = await Promise.all([
      getCandles(symbol, "D", DAILY_LOOKBACK_DAYS),
      getCandles(symbol, "60", HOURLY_LOOKBACK_DAYS),
      getCandles(symbol, "15", M15_LOOKBACK_DAYS),
    ]);

    const weekly = resampleWeekly(daily);

    const data = {
      symbol,
      generatedAt: new Date().toISOString(),
      chart: daily.slice(-CHART_DAYS),
      rsi: {
        weekly: rsiTip(rsi14(weekly.map((c) => c.close))),
        daily: rsiTip(rsi14(daily.map((c) => c.close))),
        hourly: rsiTip(rsi14(hourly.map((c) => c.close))),
        m15: rsiTip(rsi14(m15.map((c) => c.close))),
      },
    };

    CACHE.set(cacheKey, { at: Date.now(), data });
    return NextResponse.json(data);
  } catch (error) {
    console.error(`GET /api/stocks/${symbol} failed`, error);
    const detail = error instanceof Error ? error.message : String(error);
    return json({ error: "failed to load stock data", detail }, 502);
  }
}
