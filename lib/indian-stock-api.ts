// REST client for analyst.indianapi.in ("Indian API") — powers the per-stock
// analytics pane (app/dashboard/stocks/[symbol]/page.tsx) with the two
// things NSE/broker data alone doesn't give us: analyst consensus (buy/sell/
// hold, recommendation distribution) and discrete corporate events
// (dividends, splits, bonuses) plus recent news, alongside shareholding and
// key ratios.
//
// One GET /stock?symbol=X call returns all of it in a single response — no
// separate slug-resolution step needed, since it accepts the plain NSE
// trading symbol directly (the same string already stored on `signals.symbol`).
//
// Env required: INDIAN_STOCK_API_KEY. Get one at https://indianapi.in.
// Leave unset to disable — the analytics pane degrades to "not configured"
// rather than breaking the page.

const BASE_URL = "https://analyst.indianapi.in";

export function isIndianStockApiConfigured(): boolean {
  return Boolean(process.env.INDIAN_STOCK_API_KEY);
}

// Only the fields the analytics pane actually reads — the real response has
// more (financials, technicals, futures data) that isn't used here yet.
export type StockDetails = {
  companyName: string | null;
  industry: string | null;
  currentPrice: { BSE: number | null; NSE: number | null } | null;
  percentChange: number | null;
  yearHigh: number | null;
  yearLow: number | null;
  keyMetrics: Record<string, unknown> | null;
  analystView: Record<string, unknown> | null;
  recosBar: Record<string, unknown> | null;
  riskMeter: Record<string, unknown> | null;
  shareholding: Record<string, unknown> | null;
  stockCorporateActionData: unknown[] | null;
  recentNews: { headline: string; url: string }[] | null;
};

class IndianStockApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

/**
 * Fetch full stock details by exact NSE trading symbol (e.g. "WHIRLPOOL").
 * Throws IndianStockApiError on any failure — callers should catch and
 * degrade gracefully (the analytics pane shows "unavailable" for the
 * affected tiles rather than failing the whole page).
 *
 * Cached for 30 minutes (Next.js fetch cache) — this is a per-page-view
 * lookup a human triggers by clicking through, not a polled endpoint like
 * the ticker, so there's no need to hit the API fresh on every request.
 */
export async function getStockDetails(symbol: string): Promise<StockDetails> {
  const apiKey = process.env.INDIAN_STOCK_API_KEY;
  if (!apiKey) {
    throw new IndianStockApiError("INDIAN_STOCK_API_KEY not configured");
  }

  const url = `${BASE_URL}/stock?${new URLSearchParams({ symbol: symbol.toUpperCase() })}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: { "X-API-Key": apiKey },
      signal: controller.signal,
      next: { revalidate: 1800 },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new IndianStockApiError(`Indian API request failed: ${body.slice(0, 300)}`, res.status);
    }
    const data = (await res.json()) as Record<string, unknown>;
    return {
      companyName: (data.companyName as string) ?? null,
      industry: (data.industry as string) ?? null,
      currentPrice: (data.currentPrice as StockDetails["currentPrice"]) ?? null,
      percentChange: typeof data.percentChange === "number" ? data.percentChange : null,
      yearHigh: typeof data.yearHigh === "number" ? data.yearHigh : null,
      yearLow: typeof data.yearLow === "number" ? data.yearLow : null,
      keyMetrics: (data.keyMetrics as Record<string, unknown>) ?? null,
      analystView: (data.analystView as Record<string, unknown>) ?? null,
      recosBar: (data.recosBar as Record<string, unknown>) ?? null,
      riskMeter: (data.riskMeter as Record<string, unknown>) ?? null,
      shareholding: (data.shareholding as Record<string, unknown>) ?? null,
      stockCorporateActionData: (data.stockCorporateActionData as unknown[]) ?? null,
      recentNews: (data.recentNews as StockDetails["recentNews"]) ?? null,
    };
  } finally {
    clearTimeout(timeout);
  }
}
