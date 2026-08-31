import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { loadLiveSignals } from "@/lib/live-signals";
import { getStockDetails, isIndianStockApiConfigured, type StockDetails } from "@/lib/indian-stock-api";
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

  let stock: StockDetails | null = null;
  let stockError: string | null = null;
  if (isIndianStockApiConfigured()) {
    try {
      stock = await getStockDetails(symbol);
    } catch (error) {
      console.error(`GET /dashboard/stocks/${symbol}: Indian API fetch failed`, error);
      stockError = "Research data temporarily unavailable.";
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-6">
          <Link href="/dashboard" className="text-sm text-zinc-400 transition-colors hover:text-zinc-100">
            ← Dashboard
          </Link>
        </div>
      </header>
      <StockAnalyticsPane symbol={symbol} signal={signal} stock={stock} stockError={stockError} />
    </div>
  );
}
