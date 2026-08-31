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
  // active signal, the numbers here can never disagree with the rest of the app.
  const { signals } = await loadLiveSignals();
  const signal = signals.find((s) => s.symbol === symbol) ?? null;

  // Reads from stock_analytics_cache (lib/stock-analytics-cache.ts) — only
  // falls through to a live upstream fetch on a true cache miss (a symbol
  // never attempted before), so a normal page view doesn't re-hit the
  // rate-limited third-party API every time.
  const { stock, error: stockError } = await getOrPopulateStockDetails(symbol);

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-6">
          <Link href="/dashboard" className="text-sm text-zinc-400 transition-colors hover:text-zinc-100">
            ← Dashboard
          </Link>
          <Link href="/dashboard/stocks" className="text-sm text-zinc-400 transition-colors hover:text-zinc-100">
            All stocks
          </Link>
        </div>
      </header>
      <StockAnalyticsPane symbol={symbol} signal={signal} stock={stock} stockError={stockError} />
    </div>
  );
}
