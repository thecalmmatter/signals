-- Per-symbol cache for the Indian API research payload that powers
-- /dashboard/stocks/[symbol] (lib/indian-stock-api.ts). Without this, every
-- page view called the upstream API live — slow on first load, and wasteful
-- against a rate-limited third-party key. Populated by:
--   - the admin "Refresh"/"Refresh all" buttons (lib/stock-analytics-cache.ts)
--   - a best-effort auto-populate the first time a symbol is seen (Chartlink
--     webhook, manual signal add) so a newly-published stock's data is ready
--     without an admin needing to notice and click refresh
--   - a write-through fetch the first time /dashboard/stocks/[symbol] is
--     visited for a symbol with no cache row yet at all
--
-- `data` is NULL when the most recent attempt failed (see `error`) — a
-- failed attempt is still cached (with fetched_at set) so the admin panel
-- can show "last tried, failed" instead of looking untouched.
CREATE TABLE IF NOT EXISTS stock_analytics_cache (
  symbol     TEXT PRIMARY KEY,
  data       JSONB,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  error      TEXT
);
