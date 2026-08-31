// REST client for stock.indianapi.in ("Indian API") — powers the per-stock
// analytics pane (app/dashboard/stocks/[symbol]/page.tsx) with the two
// things NSE/broker data alone doesn't give us: analyst consensus (buy/sell/
// hold, recommendation distribution) and discrete corporate events
// (dividends, splits, bonuses, AGMs) plus recent news, alongside shareholding
// and key ratios.
//
// One GET /stock?name=X call returns all of it in a single response. Despite
// the param name, it accepts plain NSE trading symbols directly (e.g.
// "RELIANCE", "TCS" — the same string already stored on `signals.symbol`) as
// well as full company names — no separate slug-resolution step needed.
// NOTE: the actual API host is stock.indianapi.in — analyst.indianapi.in is
// only the docs site, and its docs page mislabels the query param as
// "symbol"; the live API rejects that and requires "name" (confirmed against
// a real authenticated response).
//
// Field shapes below are taken from a real response, not the docs (whose
// analystView/recosBar/riskMeter/shareholding examples are all "..."
// placeholders). Notably: currentPrice/percentChange/yearHigh/yearLow all
// come back as numeric strings, not numbers.
//
// Env required: INDIAN_STOCK_API_KEY. Get one at https://indianapi.in.
// Leave unset to disable — the analytics pane degrades to "not configured"
// rather than breaking the page.

const BASE_URL = "https://stock.indianapi.in";

export function isIndianStockApiConfigured(): boolean {
  return Boolean(process.env.INDIAN_STOCK_API_KEY);
}

export type RecoRow = {
  ratingName: string; // "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell"
  ratingValue: number;
  numberOfAnalysts: number;
  colorCode: string;
};

export type RecosBar = {
  stockAnalyst: RecoRow[];
  tickerRatingValue: number | null;
  noOfRecommendations: number | null;
  meanValue: number | null;
  tickerPercentage: number | null;
} | null;

export type AnalystViewRow = {
  ratingName: string; // includes a synthetic "Total" row
  ratingValue: number;
  numberOfAnalystsLatest: string;
};

export type RiskMeter = { categoryName: string; stdDev: number } | null;

export type ShareholdingCategory = {
  categoryName: string;
  displayName: string; // "Promoter" | "FII" | "MF" | "Other"
  categories: { holdingDate: string; percentage: string }[]; // chronological, oldest first
};

export type CorporateActionData = {
  bonus?: Record<string, unknown>[];
  dividend?: Record<string, unknown>[];
  rights?: Record<string, unknown>[];
  splits?: Record<string, unknown>[];
  annualGeneralMeeting?: Record<string, unknown>[];
} | null;

export type NewsItem = {
  headline: string;
  url: string;
  date?: string;
  summary?: string;
};

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
  analystView: AnalystViewRow[] | null;
  recosBar: RecosBar;
  riskMeter: RiskMeter;
  shareholding: ShareholdingCategory[] | null;
  stockCorporateActionData: CorporateActionData;
  recentNews: NewsItem[] | null;
};

class IndianStockApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Fetch full stock details by NSE trading symbol (e.g. "WHIRLPOOL") or
 * company name — the API's `name` param fuzzy-matches either.
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

  const url = `${BASE_URL}/stock?${new URLSearchParams({ name: symbol.toUpperCase() })}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: { "X-Api-Key": apiKey },
      signal: controller.signal,
      next: { revalidate: 1800 },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new IndianStockApiError(`Indian API request failed: ${body.slice(0, 300)}`, res.status);
    }
    const data = (await res.json()) as Record<string, unknown>;
    const currentPrice = data.currentPrice as Record<string, unknown> | undefined;
    return {
      companyName: (data.companyName as string) ?? null,
      industry: (data.industry as string) ?? null,
      currentPrice: currentPrice
        ? { BSE: num(currentPrice.BSE), NSE: num(currentPrice.NSE) }
        : null,
      percentChange: num(data.percentChange),
      yearHigh: num(data.yearHigh),
      yearLow: num(data.yearLow),
      keyMetrics: (data.keyMetrics as Record<string, unknown>) ?? null,
      analystView: Array.isArray(data.analystView) ? (data.analystView as AnalystViewRow[]) : null,
      recosBar: (data.recosBar as RecosBar) ?? null,
      riskMeter: (data.riskMeter as RiskMeter) ?? null,
      shareholding: Array.isArray(data.shareholding) ? (data.shareholding as ShareholdingCategory[]) : null,
      stockCorporateActionData: (data.stockCorporateActionData as CorporateActionData) ?? null,
      recentNews: Array.isArray(data.recentNews) ? (data.recentNews as NewsItem[]) : null,
    };
  } finally {
    clearTimeout(timeout);
  }
}
