import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { loadLiveSignals } from "@/lib/live-signals";
import { toneOf } from "@/lib/stocks";
import { TONES } from "@/lib/tone-styles";

// Real, findable entry point into /dashboard/stocks/[symbol] — the analytics
// pane was previously only reachable by opening the signal detail modal and
// scrolling to a "Full analysis" link, which meant almost nobody found it.
// This page lists every currently-active symbol as a direct link, and is
// itself linked from the dashboard header nav.
export const dynamic = "force-dynamic";

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 1 })}`;

export default async function StockAnalyticsIndexPage() {
  const { userId } = await auth();
  if (!userId) redirect("/login");

  const { signals } = await loadLiveSignals();
  const sorted = [...signals].sort((a, b) => a.symbol.localeCompare(b.symbol));

  return (
    <div className="flex flex-1 flex-col bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-40 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-sm text-zinc-400 transition-colors hover:text-zinc-100">
              ← Dashboard
            </Link>
          </div>
          <Link
            href="/dashboard/track-record"
            className="text-sm text-zinc-400 transition-colors hover:text-zinc-100"
          >
            Track record
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12 md:py-16">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50 md:text-3xl">
            Stock analytics
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Analyst consensus, shareholding, corporate actions and news for every
            currently-active symbol — pick one to open its full research pane.
          </p>
        </div>

        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 px-6 py-16 text-center">
            <p className="text-sm text-zinc-300">No active signals right now</p>
            <p className="mt-1 text-sm text-zinc-500">
              This page fills in automatically as new signals come in.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((s) => {
              const tone = TONES[toneOf(s.signal, s.outcome)];
              return (
                <Link
                  key={s.symbol}
                  href={`/dashboard/stocks/${s.symbol}`}
                  className={`group flex items-center justify-between gap-3 rounded-2xl border p-4 transition ${tone.card} ${tone.hover}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-zinc-50">{s.symbol}</p>
                    <p className="mt-0.5 truncate text-[11px] text-zinc-400">
                      {s.name && s.name !== s.symbol ? s.name : " "}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm font-semibold tabular-nums text-zinc-200">{inr(s.price)}</span>
                    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${tone.badge}`}>
                      {tone.label}
                    </span>
                    <svg
                      viewBox="0 0 16 16"
                      className="h-3.5 w-3.5 shrink-0 fill-current text-zinc-600 transition group-hover:text-zinc-400"
                      aria-hidden="true"
                    >
                      <path d="M8 1l5 5H9v9H7V6H3l5-5z" transform="rotate(90 8 8)" />
                    </svg>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
