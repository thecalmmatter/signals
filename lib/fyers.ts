// Fyers REST client — used server-side by /api/stocks/[symbol] to power the
// signal detail splash (candle chart + RSI cascade). Separate from the
// FYERS-MCP connector (that's a Claude-side tool, not reachable from this
// server); this talks to Fyers' HTTP API directly with the app's own
// credentials.
//
// Env required: FYERS_APP_ID, FYERS_ACCESS_TOKEN (daily-expiring — refresh
// via a cron/job outside this file; this client just uses whatever's current).

export type Candle = {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

// Fyers' history endpoint tops out at daily granularity — no native "W"/"M".
// Weekly candles are derived client-side via resampleWeekly() below.
export type Resolution = "D" | "60" | "15";

const FYERS_BASE = "https://api-t1.fyers.in/data/history";
const FYERS_QUOTES_BASE = "https://api-t1.fyers.in/data/quotes";

/** NSE equity symbol -> Fyers symbol format, e.g. "RELIANCE" -> "NSE:RELIANCE-EQ". */
export function toFyersSymbol(symbol: string): string {
  if (symbol.includes(":")) return symbol; // already fully qualified
  return `NSE:${symbol.toUpperCase()}-EQ`;
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

class FyersError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

/**
 * Fetch OHLCV candles for one resolution over the last `days` calendar days.
 * Throws FyersError on any non-2xx / malformed response — callers should catch
 * and degrade gracefully (the splash shows "chart unavailable" rather than crash).
 */
export async function getCandles(
  symbol: string,
  resolution: Resolution,
  days: number
): Promise<Candle[]> {
  const appId = process.env.FYERS_APP_ID;
  const token = process.env.FYERS_ACCESS_TOKEN;
  if (!appId || !token) {
    throw new FyersError("FYERS_APP_ID / FYERS_ACCESS_TOKEN not configured");
  }

  const to = new Date();
  const from = new Date(Date.now() - days * 86_400_000);

  const url = new URL(FYERS_BASE);
  url.searchParams.set("symbol", toFyersSymbol(symbol));
  url.searchParams.set("resolution", resolution);
  url.searchParams.set("date_format", "1");
  url.searchParams.set("range_from", fmtDate(from));
  url.searchParams.set("range_to", fmtDate(to));
  url.searchParams.set("cont_flag", "1");

  const res = await fetch(url, {
    headers: { Authorization: `${appId}:${token}` },
    // Fyers history is not real-time critical here; short edge/server cache
    // is handled by the caller (in-memory TTL), not fetch cache.
    cache: "no-store",
  });

  if (!res.ok) {
    throw new FyersError(`fyers history ${res.status}`, res.status);
  }

  const data = (await res.json()) as {
    s?: string;
    candles?: [number, number, number, number, number, number][];
    message?: string;
  };

  if (data.s !== "ok" || !Array.isArray(data.candles)) {
    throw new FyersError(data.message ?? "fyers history returned no data");
  }

  return data.candles.map(([time, open, high, low, close, volume]) => ({
    time,
    open,
    high,
    low,
    close,
    volume,
  }));
}

export type Quote = {
  ltp: number;
  prevClose: number;
  /** Day's high/low so far, from Fyers' running intraday OHLC — NOT just
   *  "the price at the moment of this poll." Used by lib/live-signals.ts to
   *  detect a stop/target that was briefly touched and recovered from
   *  between two polls: checking only the latest `ltp` on a ~10-20s poll
   *  cycle can miss a real intraday wick entirely. Falls back to `ltp` if
   *  Fyers doesn't return these for some reason (pre-market, etc.) — see
   *  the parsing below. */
  high: number;
  low: number;
};

/**
 * Live last-traded-price + previous close for a batch of symbols, keyed by
 * the *input* symbol (not the Fyers-qualified form) so callers can look up
 * by plain ticker. Used to power the ticker's live price/%change — distinct
 * from getCandles, which is history, not a live snapshot.
 */
export async function getQuotes(symbols: string[]): Promise<Map<string, Quote>> {
  const out = new Map<string, Quote>();
  if (symbols.length === 0) return out;

  const appId = process.env.FYERS_APP_ID;
  const token = process.env.FYERS_ACCESS_TOKEN;
  if (!appId || !token) {
    throw new FyersError("FYERS_APP_ID / FYERS_ACCESS_TOKEN not configured");
  }

  const fyersSymbols = symbols.map(toFyersSymbol);
  const url = new URL(FYERS_QUOTES_BASE);
  url.searchParams.set("symbols", fyersSymbols.join(","));

  const res = await fetch(url, {
    headers: { Authorization: `${appId}:${token}` },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new FyersError(`fyers quotes ${res.status}`, res.status);
  }

  const data = (await res.json()) as {
    s?: string;
    d?: {
      n?: string;
      v?: { lp?: number; prev_close_price?: number; high_price?: number; low_price?: number };
    }[];
    message?: string;
  };

  if (data.s !== "ok" || !Array.isArray(data.d)) {
    throw new FyersError(data.message ?? "fyers quotes returned no data");
  }

  // Map back from the qualified Fyers symbol to the plain ticker the caller
  // passed in, so `out` can be looked up the same way regardless of format.
  const byFyersSymbol = new Map(symbols.map((s) => [toFyersSymbol(s), s]));

  for (const item of data.d) {
    if (!item.n) continue;
    const plain = byFyersSymbol.get(item.n) ?? item.n;
    const ltp = item.v?.lp;
    const prevClose = item.v?.prev_close_price;
    const highPrice = item.v?.high_price;
    const lowPrice = item.v?.low_price;
    if (typeof ltp === "number") {
      out.set(plain, {
        ltp,
        prevClose: typeof prevClose === "number" ? prevClose : ltp,
        // Fall back to ltp if Fyers doesn't return these (shouldn't normally
        // happen once the market's open, but never let a missing field make
        // the day-range narrower than reality — that would silently disable
        // the intraday-touch stop/target detection in lib/live-signals.ts
        // rather than just degrading to the old ltp-only behavior).
        high: typeof highPrice === "number" && highPrice > 0 ? highPrice : ltp,
        low: typeof lowPrice === "number" && lowPrice > 0 ? lowPrice : ltp,
      });
    }
  }

  return out;
}

/**
 * Wilder's RSI(14) over a close-price series. Returns one RSI value per input
 * close from index `period` onward (empty array if not enough data).
 */
export function rsi14(closes: number[], period = 14): number[] {
  if (closes.length <= period) return [];

  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(Math.max(diff, 0));
    losses.push(Math.max(-diff, 0));
  }

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  const out: number[] = [];
  const pushRsi = () => {
    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    out.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + rs));
  };
  pushRsi();

  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    pushRsi();
  }

  return out;
}

/**
 * Fyers has no native weekly resolution — build weekly OHLCV bars from a
 * daily series by grouping into Monday-start weeks (NSE trading weeks).
 * Candles must be in ascending time order (as returned by getCandles).
 */
export function resampleWeekly(daily: Candle[]): Candle[] {
  const weeks = new Map<string, Candle[]>();

  for (const c of daily) {
    const d = new Date(c.time * 1000);
    const day = d.getUTCDay(); // 0=Sun..6=Sat
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() + mondayOffset);
    monday.setUTCHours(0, 0, 0, 0);
    const key = monday.toISOString().slice(0, 10);
    const bucket = weeks.get(key);
    if (bucket) bucket.push(c);
    else weeks.set(key, [c]);
  }

  return Array.from(weeks.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, group]) => ({
      time: Math.floor(new Date(`${key}T00:00:00Z`).getTime() / 1000),
      open: group[0].open,
      high: Math.max(...group.map((c) => c.high)),
      low: Math.min(...group.map((c) => c.low)),
      close: group[group.length - 1].close,
      volume: group.reduce((sum, c) => sum + c.volume, 0),
    }));
}

export type RsiTip = {
  latest: number;
  prior: number | null;
  rising: boolean;
  above60: boolean;
};

/** Last two RSI values reduced to the "tip" judgment the swing-signal cascade uses. */
export function rsiTip(values: number[]): RsiTip | null {
  if (values.length === 0) return null;
  const latest = values[values.length - 1];
  const prior = values.length >= 2 ? values[values.length - 2] : null;
  return {
    latest,
    prior,
    rising: prior === null ? false : latest > prior,
    above60: latest > 60,
  };
}
