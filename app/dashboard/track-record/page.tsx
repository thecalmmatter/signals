import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { loadLiveSignals, type LiveSignal } from "@/lib/live-signals";
import { getCachedStockDetailsBatch } from "@/lib/stock-analytics-cache";
import { convictionScore, type ConvictionScore } from "@/lib/conviction-score";
import { SymbolLink } from "@/components/symbol-link";

export const dynamic = "force-dynamic";

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 1 })}`;

// Days since this symbol's active signal was generated, to today.
function daysSince(generatedAt: string): number {
  const start = new Date(generatedAt).getTime();
  return Math.max(0, Math.round((Date.now() - start) / 86_400_000));
}

// The price to judge a trade against: once closed (stopped/target_hit), that
// is the frozen exit price, never the live quote — the live price keeps
// drifting after the fact (a "stopped" trade can float back above the stop
// hours later), which was exactly the confusing bit. Falls back to the live
// price if a legacy row somehow has no exit price recorded.
function referencePrice(s: LiveSignal): number {
  if ((s.outcome === "stopped" || s.outcome === "target_hit") && s.exitPrice !== null) {
    return s.exitPrice;
  }
  return s.price;
}

// Return since the signal was generated: live price vs entry while open,
// frozen exit price vs entry once closed — see referencePrice(). null if the
// signal has no entry price yet (fresh webhook signal an admin hasn't
// completed) — never fabricated.
function returnPct(s: LiveSignal): number | null {
  if (s.entry === null || !s.entry) return null;
  const raw = ((referencePrice(s) - s.entry) / s.entry) * 100;
  return s.signal === "sell" ? -raw : raw;
}

function ScoreCell({ score, hasResearch }: { score: ConvictionScore; hasResearch: boolean }) {
  if (!hasResearch) {
    return (
      <span className="text-zinc-600" title="No research data cached yet for this symbol">
        —
      </span>
    );
  }
  const tone = score.overall >= 70 ? "text-emerald-400" : score.overall >= 40 ? "text-amber-400" : "text-red-400";
  return (
    <span
      className={`font-medium tabular-nums ${tone}`}
      title={`Technical ${score.technical} · Analyst ${score.analyst} · Ownership ${score.ownership} — heuristic, not investment advice`}
    >
      {score.overall}
    </span>
  );
}

// Live-derived direction badge — flips from BUY/SELL to TARGET HIT/STOPPED
// once the live price crosses a level, same rule as the ticker/modal
// (s.outcome, computed once in loadLiveSignals so this page and the ticker
// can never disagree on whether a signal has actually played out).
function DirBadge({ s }: { s: LiveSignal }) {
  if (s.outcome === "stopped") {
    return (
      <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-400 ring-1 ring-inset ring-amber-400/30">
        stopped
      </span>
    );
  }
  if (s.outcome === "target_hit") {
    return (
      <span className="rounded-md bg-sky-500/15 px-1.5 py-0.5 text-[11px] font-medium text-sky-400 ring-1 ring-inset ring-sky-400/30">
        target hit
      </span>
    );
  }
  return (
    <span
      className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
        s.signal === "sell"
          ? "bg-red-500/15 text-red-400 ring-red-400/30"
          : s.signal === "watch"
            ? "bg-zinc-700/40 text-zinc-400 ring-zinc-500/30"
            : "bg-emerald-500/15 text-emerald-400 ring-emerald-400/30"
      }`}
    >
      {s.signal}
    </span>
  );
}

// `reached` comes straight from the sticky target1Hit/target2Hit/target3Hit
// flags on LiveSignal (see lib/live-signals.ts) — once a target is hit it
// stays checked forever, even if price later retraces below it. That's a
// fact about the trade's history, not something a live quote should be able
// to un-happen.
function TargetCell({ value, reached }: { value: number | null; reached: boolean }) {
  if (!value) return <span className="text-zinc-600">—</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="tabular-nums text-zinc-300">{inr(value)}</span>
      {reached && (
        <span className="text-emerald-400" title="Target reached — stays checked even if price pulls back">
          ✓
        </span>
      )}
    </span>
  );
}

export default async function TrackRecordPage() {
  const { userId } = await auth();
  if (!userId) redirect("/login");

  const { signals, quotesOk } = await loadLiveSignals();
  // Read-only, batched (one query, not N) — never triggers a live fetch, just
  // whatever's already cached (see lib/stock-analytics-cache.ts). Powers the
  // Score column below.
  const stockMap = await getCachedStockDetailsBatch(signals.map((s) => s.symbol));

  const returns = signals.map(returnPct).filter((v): v is number => v !== null);
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : null;
  const up = returns.filter((v) => v >= 0).length;
  const down = returns.length - up;

  return (
    <div className="flex flex-1 flex-col bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-40 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-500/15 text-emerald-400 ring-1 ring-inset ring-emerald-400/30">
              <svg viewBox="0 0 16 16" className="h-4 w-4 fill-current" aria-hidden="true">
                <path d="M2 12l3.5-3.5 2.5 2.5L13 5l2 2v6H2z" />
              </svg>
            </span>
            <span className="text-sm font-semibold tracking-tight">Signals</span>
          </div>
          <Link
            href="/dashboard"
            className="text-sm text-zinc-400 transition-colors hover:text-zinc-100"
          >
            ← Signal feed
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12 md:py-16">
        <div className="mb-8">
          <p className="font-mono text-xs uppercase tracking-widest text-sky-400">Track record</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50 md:text-3xl">
            Every live signal, wins and losses both.
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            This tracks exactly what&rsquo;s live in the signal feed right now — nothing suppressed,
            nothing closed out and dropped, nothing added separately. Return % is live price vs
            entry while a trade is open, and the actual stop/target exit price vs entry once it&rsquo;s
            closed — never the live price after the fact, since that keeps drifting once the trade
            is already over. Not every signal performs as expected — that&rsquo;s the point of
            showing it unfiltered.
          </p>
          {!quotesOk && (
            <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
              Live prices are unavailable right now (Fyers down or unconfigured) — returns below
              can&rsquo;t be computed until they&rsquo;re back.
            </p>
          )}
        </div>

        <div className="mb-6 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-zinc-300">
            {signals.length} live
          </span>
          <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-emerald-400">
            {up} up
          </span>
          <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-red-400">
            {down} down
          </span>
          {avgReturn !== null && (
            <span
              className={`rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 ${
                avgReturn >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
              title="Live price vs entry while open, exit price vs entry once closed — across every signal that has an entry price set."
            >
              {avgReturn >= 0 ? "+" : ""}
              {avgReturn.toFixed(1)}% avg return ({returns.length} of {signals.length})
            </span>
          )}
        </div>

        <section className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2.5">Symbol</th>
                <th className="px-3 py-2.5">Score</th>
                <th className="px-3 py-2.5">Dir</th>
                <th className="px-3 py-2.5">Since</th>
                <th className="px-3 py-2.5">Entry</th>
                <th className="px-3 py-2.5">T1</th>
                <th className="px-3 py-2.5">T2</th>
                <th className="px-3 py-2.5">T3</th>
                <th className="px-3 py-2.5">Stop</th>
                <th className="px-3 py-2.5">Live / Exit</th>
                <th className="px-3 py-2.5">Return</th>
                <th className="px-3 py-2.5">Days</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {signals.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-3 py-8 text-center text-zinc-500">
                    No live signals right now.
                  </td>
                </tr>
              )}
              {signals.map((s) => {
                const ret = returnPct(s);
                const closed = s.outcome === "stopped" || s.outcome === "target_hit";
                const stockDetails = stockMap.get(s.symbol) ?? null;
                const hasResearch = stockDetails !== null;
                const score = convictionScore(s, stockDetails);
                return (
                  <tr key={s.symbol} className="bg-zinc-950">
                    <td className="px-3 py-2.5">
                      <SymbolLink
                        symbol={s.symbol}
                        className="font-medium text-zinc-100 decoration-zinc-600 decoration-dotted underline-offset-4 transition-colors hover:text-emerald-400 hover:underline"
                      >
                        {s.symbol}
                      </SymbolLink>
                    </td>
                    <td className="px-3 py-2.5">
                      <ScoreCell score={score} hasResearch={hasResearch} />
                    </td>
                    <td className="px-3 py-2.5">
                      <DirBadge s={s} />
                    </td>
                    <td className="px-3 py-2.5 text-xs text-zinc-400">
                      {new Date(s.generatedAt).toISOString().slice(0, 10)}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-zinc-300">
                      {s.entry ? inr(s.entry) : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <TargetCell value={s.target} reached={s.target1Hit} />
                    </td>
                    <td className="px-3 py-2.5">
                      <TargetCell value={s.target2} reached={s.target2Hit} />
                    </td>
                    <td className="px-3 py-2.5">
                      <TargetCell value={s.target3} reached={s.target3Hit} />
                    </td>
                    <td className="px-3 py-2.5">
                      {s.stop ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="tabular-nums text-zinc-300">{inr(s.stop)}</span>
                          {s.outcome === "stopped" && (
                            <span className="text-amber-400" title="Price hit the stop">✕</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-zinc-300">
                      {closed ? (
                        <span
                          className="text-zinc-500"
                          title={
                            s.exitPrice !== null
                              ? `Closed at ${inr(s.exitPrice)} — the actual stop/target exit price, not a live quote`
                              : "Trade closed"
                          }
                        >
                          Closed
                        </span>
                      ) : (
                        inr(s.price)
                      )}
                    </td>
                    <td
                      className={`px-3 py-2.5 font-medium tabular-nums ${
                        ret === null ? "text-zinc-600" : ret >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {ret === null ? "—" : `${ret >= 0 ? "+" : ""}${ret.toFixed(1)}%`}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-zinc-400">{daysSince(s.generatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
