// Tiny, side-effect-free shared constant — split out of
// lib/stock-analytics-cache.ts (which imports server-only things: pg's Pool,
// next/server's after()) specifically so components/stock-analytics-pane.tsx
// (a "use client" component) can import this exact string for its
// auto-refresh check without pulling server-only code into the client bundle.
export const STOCK_ANALYTICS_POPULATING_MESSAGE =
  "Research data is being fetched for the first time — check back in a few seconds.";
