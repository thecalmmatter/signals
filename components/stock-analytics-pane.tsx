"use client";

// The "floating glass tiles over a particle field" analytics pane —
// productionized from the throwaway prototype (prototypes/analytics-pane-prototype.html)
// into a real component fed by real props instead of hardcoded numbers.
//
// Data shape caveat: analyst.indianapi.in's docs show analystView/recosBar/
// riskMeter/shareholding fields only as "..." placeholders — the exact keys
// haven't been confirmed against a live response yet (no API key tested
// against production so far). Every read below is defensive (tries a few
// likely field names, falls back to "—") for exactly that reason. Once a
// real INDIAN_STOCK_API_KEY is set and this page has actually been hit,
// inspect the real payload and tighten lib/indian-stock-api.ts's types +
// the field lookups here.

import { LandingParticleCanvas } from "./landing-particle-canvas";
import type { LiveSignal } from "@/lib/live-signals";
import type { StockDetails } from "@/lib/indian-stock-api";

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 1 })}`;

function pickNumber(obj: Record<string, unknown> | null | undefined, keys: string[]): number | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number") return v;
  }
  return null;
}

function pickString(obj: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

function returnPct(signal: LiveSignal): number | null {
  if (!signal.entry || signal.entry <= 0) return null;
  const raw = ((signal.price - signal.entry) / signal.entry) * 100;
  return signal.signal === "sell" ? -raw : raw;
}

// First-pass heuristic composite, 0-100. Deliberately simple and openly
// approximate — refine once analystView/shareholding's real shape is known.
function convictionScore(signal: LiveSignal | null, stock: StockDetails | null) {
  const technical = !signal ? 50 : signal.outcome === "target_hit" ? 90 : signal.outcome === "stopped" ? 20 : 65;

  const buy = pickNumber(stock?.recosBar ?? null, ["buy", "strongBuy", "Buy"]);
  const sell = pickNumber(stock?.recosBar ?? null, ["sell", "strongSell", "Sell"]);
  const hold = pickNumber(stock?.recosBar ?? null, ["hold", "Hold"]);
  const totalRecos = (buy ?? 0) + (sell ?? 0) + (hold ?? 0);
  const analyst = totalRecos > 0 ? Math.round((((buy ?? 0) + (hold ?? 0) * 0.5) / totalRecos) * 100) : 50;

  const promoterPct = pickNumber(stock?.shareholding ?? null, ["promoter", "Promoter", "promoterHolding"]);
  const ownership = promoterPct === null ? 50 : promoterPct >= 50 ? 70 : promoterPct >= 25 ? 55 : 40;

  const overall = Math.round(technical * 0.4 + analyst * 0.35 + ownership * 0.25);
  return { overall, technical, analyst, ownership };
}

export function StockAnalyticsPane({
  symbol,
  signal,
  stock,
  stockError,
}: {
  symbol: string;
  signal: LiveSignal | null;
  stock: StockDetails | null;
  stockError?: string | null;
}) {
  const score = convictionScore(signal, stock);
  const pct = signal ? returnPct(signal) : null;

  const buy = pickNumber(stock?.recosBar ?? null, ["buy", "strongBuy", "Buy"]);
  const sell = pickNumber(stock?.recosBar ?? null, ["sell", "strongSell", "Sell"]);
  const hold = pickNumber(stock?.recosBar ?? null, ["hold", "Hold"]);
  const riskLabel = pickString(stock?.riskMeter ?? null, ["riskLevel", "category", "label", "risk"]);

  const promoterPct = pickNumber(stock?.shareholding ?? null, ["promoter", "Promoter", "promoterHolding"]);
  const fiiPct = pickNumber(stock?.shareholding ?? null, ["fii", "FII", "fiiHolding"]);
  const diiPct = pickNumber(stock?.shareholding ?? null, ["dii", "DII", "diiHolding"]);
  const publicPct = pickNumber(stock?.shareholding ?? null, ["public", "Public", "publicHolding"]);

  const corporateActions = Array.isArray(stock?.stockCorporateActionData) ? stock!.stockCorporateActionData : [];
  const news = stock?.recentNews ?? [];

  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden bg-zinc-950 text-zinc-100">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 30% 20%, rgba(16,185,129,0.10), transparent 55%), radial-gradient(ellipse at 75% 75%, rgba(56,189,248,0.09), transparent 55%), linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "auto, auto, 42px 42px, 42px 42px",
        }}
      />
      <LandingParticleCanvas />

      <div className="relative mx-auto max-w-6xl px-6 py-10">
        <p className="mb-6 font-mono text-[11px] uppercase tracking-widest text-zinc-500">
          {stock?.companyName ?? symbol} · analytics
        </p>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Trade levels */}
          <div className="glass-panel rounded-2xl p-6" style={{ boxShadow: "0 0 50px -22px rgba(16,185,129,0.35)" }}>
            <div className="flex items-baseline gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{symbol}</h1>
              {signal ? (
                <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-400 ring-1 ring-inset ring-emerald-400/30">
                  {signal.outcome === "stopped" ? "stopped" : signal.outcome === "target_hit" ? "target hit" : signal.signal}
                </span>
              ) : (
                <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-medium text-zinc-400 ring-1 ring-inset ring-zinc-700">
                  no active signal
                </span>
              )}
            </div>

            {signal ? (
              <>
                <div className="mt-5 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-zinc-500">Entry</p>
                    <p className="mt-1 text-lg font-medium">{signal.entry ? inr(signal.entry) : "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-zinc-500">Target · T1</p>
                    <p className="mt-1 text-lg font-medium">{signal.target ? inr(signal.target) : "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-zinc-500">Stop</p>
                    <p className="mt-1 text-lg font-medium">{signal.stop ? inr(signal.stop) : "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-zinc-500">Days in</p>
                    <p className="mt-1 text-lg font-medium">{signal.daysIn}</p>
                  </div>
                </div>
                <div className="mt-5 flex items-baseline justify-between border-t border-white/[0.08] pt-4">
                  <span className="text-sm text-zinc-500">Live {inr(signal.price)}</span>
                  <span className={`text-base font-medium ${pct !== null && pct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {pct !== null ? `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%` : "—"}
                  </span>
                </div>
              </>
            ) : (
              <p className="mt-5 text-sm leading-6 text-zinc-500">
                No signal is currently active for {symbol}. Showing research data only.
              </p>
            )}
          </div>

          {/* Conviction score */}
          <div className="glass-panel rounded-2xl p-6 text-center" style={{ boxShadow: "0 0 60px -20px rgba(56,189,248,0.4)" }}>
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">Conviction score</p>
            <p className="editorial-gradient-text mt-1 text-5xl font-semibold">{score.overall}</p>
            <p className="mt-2 text-xs text-zinc-500">
              Technical + analyst consensus + ownership — first-pass heuristic, not investment advice.
            </p>
            <div className="mt-4 flex justify-center gap-5 text-xs text-zinc-500">
              <span>
                Technical <b className="text-zinc-200">{score.technical}</b>
              </span>
              <span>
                Analyst <b className="text-zinc-200">{score.analyst}</b>
              </span>
              <span>
                Ownership <b className="text-zinc-200">{score.ownership}</b>
              </span>
            </div>
          </div>

          {/* Analyst view */}
          <div className="glass-panel rounded-2xl p-6">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">Analyst view</p>
            {stock ? (
              <>
                <div className="mt-3 flex gap-5 text-sm font-medium">
                  <span className="text-emerald-400">{buy ?? "—"} buy</span>
                  <span className="text-zinc-400">{hold ?? "—"} hold</span>
                  <span className="text-red-400">{sell ?? "—"} sell</span>
                </div>
                <p className="mt-3 text-xs leading-5 text-zinc-500">
                  Risk: {riskLabel ?? "not reported"}. Analyst consensus is third-party (analyst.indianapi.in), not this app&rsquo;s own view.
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-zinc-500">
                {stockError ?? "Not configured — set INDIAN_STOCK_API_KEY to enable."}
              </p>
            )}
          </div>

          {/* Ownership */}
          <div className="glass-panel rounded-2xl p-6">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">Ownership</p>
            {stock?.shareholding ? (
              <div className="mt-3 grid grid-cols-4 gap-3 text-center">
                <div>
                  <p className="text-lg font-medium">{promoterPct ?? "—"}{promoterPct !== null ? "%" : ""}</p>
                  <p className="text-[10px] text-zinc-500">Promoter</p>
                </div>
                <div>
                  <p className="text-lg font-medium">{fiiPct ?? "—"}{fiiPct !== null ? "%" : ""}</p>
                  <p className="text-[10px] text-zinc-500">FII</p>
                </div>
                <div>
                  <p className="text-lg font-medium">{diiPct ?? "—"}{diiPct !== null ? "%" : ""}</p>
                  <p className="text-[10px] text-zinc-500">DII</p>
                </div>
                <div>
                  <p className="text-lg font-medium">{publicPct ?? "—"}{publicPct !== null ? "%" : ""}</p>
                  <p className="text-[10px] text-zinc-500">Public</p>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-zinc-500">
                {stockError ?? "Not configured — set INDIAN_STOCK_API_KEY to enable."}
              </p>
            )}
          </div>

          {/* Events: corporate actions + recent news */}
          <div className="glass-panel rounded-2xl p-6 md:col-span-2">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">Recent events</p>
            {corporateActions.length === 0 && news.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">
                {stock ? "Nothing reported recently." : stockError ?? "Not configured — set INDIAN_STOCK_API_KEY to enable."}
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {corporateActions.slice(0, 3).map((action, i) => (
                  <li key={`ca-${i}`} className="text-sm leading-5 text-zinc-300">
                    {typeof action === "string" ? action : JSON.stringify(action)}
                  </li>
                ))}
                {news.slice(0, 3).map((item, i) => (
                  <li key={`news-${i}`} className="text-sm leading-5">
                    {item.url ? (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-zinc-300 underline decoration-zinc-700 underline-offset-2 hover:text-zinc-50"
                      >
                        {item.headline}
                      </a>
                    ) : (
                      <span className="text-zinc-300">{item.headline}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
