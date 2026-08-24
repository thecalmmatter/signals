// Single source of truth for "what's actually live right now" — the exact
// same signal set the ticker/marquee shows (status = 'active' only, one row
// per symbol, latest edit wins), with live Fyers quotes merged in.
//
// Both /api/signals (the ticker) and the track record page call
// loadLiveSignals() — neither queries `signals` independently — so the two
// can never drift apart. Suppressed/manual_override/closed signals are
// excluded at the query level here, not filtered after the fact by a caller
// that might get it wrong.
//
// Deliberately does NOT read from the `positions` ledger table — that's a
// separate manual/auto-populated bookkeeping table that can lag or contain
// entries for signals that are no longer active. "Live signals matter,
// nothing else."

import { getPool } from "./db";
import { getQuotes, type Quote } from "./fyers";

export type LiveSignal = {
  symbol: string;
  name: string;
  signal: "buy" | "sell" | "watch";
  price: number;
  changePct: number;
  change: number;
  entry: number | null;
  target: number | null;
  stop: number | null;
  daysIn: number;
  daysToExit: number;
  /** When this symbol's active signal was first generated (ISO). */
  generatedAt: string;
};

// Shared across every caller within a server instance's lifetime (every
// signed-in user's ticker polls every 10s, plus the track record page) —
// cache briefly so we're not hammering Fyers once per request. Keyed by the
// sorted symbol set so it self-invalidates when the active signal list
// changes.
type QuoteCacheEntry = { at: number; data: Map<string, Quote> };
let quoteCache: QuoteCacheEntry | null = null;
let quoteCacheKey = "";
const QUOTE_TTL_MS = 20_000;

async function getQuotesCached(symbols: string[]): Promise<Map<string, Quote>> {
  if (symbols.length === 0) return new Map();
  const key = [...symbols].sort().join(",");
  if (quoteCache && quoteCacheKey === key && Date.now() - quoteCache.at < QUOTE_TTL_MS) {
    return quoteCache.data;
  }
  const data = await getQuotes(symbols);
  quoteCache = { at: Date.now(), data };
  quoteCacheKey = key;
  return data;
}

export async function loadLiveSignals(): Promise<{ signals: LiveSignal[]; quotesOk: boolean }> {
  const { rows } = await getPool().query(
    `SELECT * FROM (
       SELECT DISTINCT ON (symbol)
              symbol, name, signal_type, price,
              entry_price, target_price, stop_price, days_in, days_to_exit,
              status, generated_at, updated_at
         FROM signals
        WHERE status = 'active'
        ORDER BY symbol, updated_at DESC
     ) t
     ORDER BY generated_at DESC, symbol`
  );

  let quotes = new Map<string, Quote>();
  let quotesOk = true;
  try {
    quotes = await getQuotesCached(rows.map((r) => r.symbol as string));
  } catch (error) {
    console.error("loadLiveSignals: live quotes unavailable, falling back to stored price", error);
    quotesOk = false;
  }

  const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));

  const signals: LiveSignal[] = rows.map((r) => {
    const quote = quotes.get(r.symbol as string);
    const price = quote ? quote.ltp : Number(r.price) || 0;
    const changePct = quote && quote.prevClose ? ((quote.ltp - quote.prevClose) / quote.prevClose) * 100 : 0;
    const change = quote ? quote.ltp - quote.prevClose : 0;
    return {
      symbol: r.symbol as string,
      name: (r.name ?? r.symbol) as string,
      signal: r.signal_type as "buy" | "sell" | "watch",
      price,
      changePct,
      change,
      entry: numOrNull(r.entry_price),
      target: numOrNull(r.target_price),
      stop: numOrNull(r.stop_price),
      daysIn: Number(r.days_in) || 0,
      daysToExit: Number(r.days_to_exit) || 0,
      generatedAt: new Date(r.generated_at as string).toISOString(),
    };
  });

  return { signals, quotesOk };
}
