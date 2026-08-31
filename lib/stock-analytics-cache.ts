// Cache + refresh pipeline for the Indian API research payload
// (lib/indian-stock-api.ts) that powers /dashboard/stocks/[symbol].
//
// Why this exists: getStockDetails() is a live call to a third-party,
// rate-limited API. Calling it fresh on every page view is slow for the
// visitor and needlessly hammers the upstream key. This module persists the
// result per symbol (scripts/migration_stock_analytics_cache.sql) and gives
// three ways to populate it:
//   1. ensureStockAnalyticsCached() — best-effort, fire on signal ingestion
//      (chartlink webhook, manual add) so a newly-published stock's data is
//      ready by the time anyone clicks through, not fetched cold on first view.
//   2. refreshStockAnalytics() / refreshAllStockAnalytics() — explicit,
//      admin-triggered (the "Refresh" / "Refresh all" buttons).
//   3. getOrPopulateStockDetails() — read path for the page itself; write-through
//      fetch on a true cache miss (covers symbols that predate this table, or
//      a race with #1) so the page never just shows nothing.
//
// A cached row with data = NULL means "we tried and it failed" (see `error`)
// — still counts as "cached" for ensureStockAnalyticsCached's purposes, since
// retrying automatically on every single-symbol touch would defeat the point
// of caching; the admin panel surfaces the failure for a manual retry instead.

import { getPool } from "./db";
import { getStockDetails, isIndianStockApiConfigured, type StockDetails } from "./indian-stock-api";
import { loadLiveSignals } from "./live-signals";

const MIGRATION_HINT = "run scripts/migration_stock_analytics_cache.sql?";

export type StockAnalyticsStatus = {
  symbol: string;
  hasData: boolean;
  fetchedAt: string | null;
  error: string | null;
};

async function activeSymbols(): Promise<string[]> {
  const { signals } = await loadLiveSignals();
  return [...new Set(signals.map((s) => s.symbol))].sort();
}

/** Read-only cache lookup. Returns fetchedAt = null when the symbol has
 * never been attempted at all (distinct from a cached failure). */
export async function getCachedStockDetails(
  symbol: string
): Promise<{ stock: StockDetails | null; error: string | null; fetchedAt: string | null }> {
  try {
    const { rows } = await getPool().query(
      `SELECT data, fetched_at, error FROM stock_analytics_cache WHERE symbol = $1`,
      [symbol]
    );
    const row = rows[0];
    if (!row) return { stock: null, error: null, fetchedAt: null };
    return {
      stock: (row.data as StockDetails | null) ?? null,
      error: (row.error as string | null) ?? null,
      fetchedAt: row.fetched_at ? new Date(row.fetched_at as string).toISOString() : null,
    };
  } catch (error) {
    console.error(`getCachedStockDetails(${symbol}) failed (${MIGRATION_HINT})`, error);
    return { stock: null, error: null, fetchedAt: null };
  }
}

/** Hit the upstream API now and upsert the result (success or failure) into
 * the cache. This is the only function that actually calls getStockDetails(). */
export async function refreshStockAnalytics(symbol: string): Promise<{ ok: boolean; error?: string }> {
  if (!isIndianStockApiConfigured()) {
    return { ok: false, error: "INDIAN_STOCK_API_KEY not configured" };
  }
  const pool = getPool();
  try {
    const stock = await getStockDetails(symbol);
    await pool.query(
      `INSERT INTO stock_analytics_cache (symbol, data, fetched_at, error)
       VALUES ($1, $2::jsonb, now(), NULL)
       ON CONFLICT (symbol) DO UPDATE SET
         data = EXCLUDED.data, fetched_at = EXCLUDED.fetched_at, error = NULL`,
      [symbol, JSON.stringify(stock)]
    );
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    try {
      await pool.query(
        `INSERT INTO stock_analytics_cache (symbol, data, fetched_at, error)
         VALUES ($1, NULL, now(), $2)
         ON CONFLICT (symbol) DO UPDATE SET
           fetched_at = EXCLUDED.fetched_at, error = EXCLUDED.error`,
        [symbol, message.slice(0, 500)]
      );
    } catch (cacheError) {
      console.error(`refreshStockAnalytics(${symbol}): failed to persist error (${MIGRATION_HINT})`, cacheError);
    }
    return { ok: false, error: message };
  }
}

/** Admin "Refresh all" — every symbol with an active live signal right now.
 * Sequential with a small delay: this is a deliberate, infrequent admin
 * action, not a hot path, and sequential is gentler on the upstream API's
 * rate limit than firing every request at once. */
export async function refreshAllStockAnalytics(): Promise<{ symbol: string; ok: boolean; error?: string }[]> {
  const symbols = await activeSymbols();
  const results: { symbol: string; ok: boolean; error?: string }[] = [];
  for (const symbol of symbols) {
    const res = await refreshStockAnalytics(symbol);
    results.push({ symbol, ...res });
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return results;
}

/** Best-effort populate — only fetches if this symbol has never been
 * attempted before. Called from signal ingestion (chartlink webhook, manual
 * signal add) so a newly-published stock is ready to view without an admin
 * needing to notice and click refresh. Never throws — a failure here must
 * never break signal ingestion. */
export async function ensureStockAnalyticsCached(symbol: string): Promise<void> {
  if (!isIndianStockApiConfigured()) return;
  try {
    const { rows } = await getPool().query(`SELECT 1 FROM stock_analytics_cache WHERE symbol = $1`, [symbol]);
    if (rows[0]) return;
    await refreshStockAnalytics(symbol);
  } catch (error) {
    console.error(`ensureStockAnalyticsCached(${symbol}) failed (${MIGRATION_HINT})`, error);
  }
}

/** Read path for /dashboard/stocks/[symbol] itself. Trusts an existing cache
 * row (success or failure) as-is — freshness is the admin's job via the
 * refresh buttons, not re-fetched on every page view. Only a true "never
 * attempted" miss triggers a write-through fetch here, so the page never
 * shows nothing just because the ingestion-time auto-populate hasn't run yet
 * (e.g. a symbol added before this cache existed). */
export async function getOrPopulateStockDetails(
  symbol: string
): Promise<{ stock: StockDetails | null; error: string | null }> {
  if (!isIndianStockApiConfigured()) return { stock: null, error: null };
  const cached = await getCachedStockDetails(symbol);
  if (cached.fetchedAt !== null) {
    return { stock: cached.stock, error: cached.error };
  }
  const result = await refreshStockAnalytics(symbol);
  if (!result.ok) {
    return { stock: null, error: result.error ?? "Research data temporarily unavailable." };
  }
  const fresh = await getCachedStockDetails(symbol);
  return { stock: fresh.stock, error: fresh.error };
}

/** Status list for the admin panel — one row per currently-active symbol,
 * joined against whatever's cached (or nothing, if never attempted). */
export async function listStockAnalyticsStatus(): Promise<StockAnalyticsStatus[]> {
  const symbols = await activeSymbols();
  if (symbols.length === 0) return [];
  try {
    const { rows } = await getPool().query(
      `SELECT symbol, (data IS NOT NULL) AS has_data, fetched_at, error
         FROM stock_analytics_cache WHERE symbol = ANY($1)`,
      [symbols]
    );
    const bySymbol = new Map(rows.map((r) => [r.symbol as string, r]));
    return symbols.map((symbol) => {
      const row = bySymbol.get(symbol);
      return {
        symbol,
        hasData: Boolean(row?.has_data),
        fetchedAt: row?.fetched_at ? new Date(row.fetched_at as string).toISOString() : null,
        error: (row?.error as string | null) ?? null,
      };
    });
  } catch (error) {
    console.error(`listStockAnalyticsStatus failed (${MIGRATION_HINT})`, error);
    return symbols.map((symbol) => ({ symbol, hasData: false, fetchedAt: null, error: null }));
  }
}
