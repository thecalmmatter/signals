import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { loadLiveSignals } from "@/lib/live-signals";
import { getOrPopulateStockDetails } from "@/lib/stock-analytics-cache";
import { StockAnalyticsPane } from "@/components/stock-analytics-pane";

export const dynamic = "force-dynamic";

export default async function StockAnalyticsPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/login");

  const { symbol: rawSymbol } = await params;
  const symbol = rawSymbol.toUpperCase();

  // Same source as the ticker/track-record page — if this symbol has an
  // active signal, the numbers here can never disagree with the rest of the
  // app. Independent of the stock-analytics lookup below (different tables,
  // different upstream APIs), so run them concurrently instead of paying
  // for both round trips back to back — loadLiveSignals in particular can
  // be slow (live Fyers quotes for every active symbol, not just this one).
  const [{ signals }, { stock, error: stockError }] = await Promise.all([
    loadLiveSignals(),
    // Reads from stock_analytics_cache (lib/stock-analytics-cache.ts) — only
    // falls through to a live upstream fetch on a true cache miss (a symbol
    // never attempted before), so a normal page view doesn't re-hit the
    // rate-limited third-party API every time.
    getOrPopulateStockDetails(symbol),
  ]);
  const signal = signals.find((s) => s.symbol === symbol) ?? null;

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-6">
          <Link href="/dashboard" className="text-sm text-zinc-400 transition-colors hover:text-zinc-100">
            ← Dashboard
          </Link>
          <Link
            href="/dashboard/track-record"
            className="text-sm text-zinc-400 transition-colors hover:text-zinc-100"
          >
            Track record
          </Link>
        </div>
      </header>
      <StockAnalyticsPane symbol={symbol} signal={signal} stock={stock} stockError={stockError} />
    </div>
  );
}
