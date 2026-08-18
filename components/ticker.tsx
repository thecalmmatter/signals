"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { toneOf, type TickerStock } from "@/lib/stocks";
import { fetchSignals } from "@/lib/signals";
import { TONES } from "@/lib/tone-styles";
import { SignalDetailModal } from "@/components/signal-detail-modal";

const inr = (n: number) =>
  `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 1 })}`;

const pct = (n: number) =>
  n === 0 ? "0.0%" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;

function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

function TickerCard({
  stock,
  open,
  onToggle,
  onExpand,
  widthClass = "w-full",
}: {
  stock: TickerStock;
  open: boolean;
  onToggle: (symbol: string) => void;
  onExpand: (symbol: string) => void;
  widthClass?: string;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLButtonElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const tone = TONES[toneOf(stock.signal)];

  const handleMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (reduced || open) {
      setTilt({ x: 0, y: 0 });
      return;
    }
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ y: px * 12, x: -py * 10 });
  };

  const resetTilt = () => setTilt({ x: 0, y: 0 });

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => (open ? onExpand(stock.symbol) : onToggle(stock.symbol))}
      onMouseMove={handleMove}
      onMouseLeave={resetTilt}
      aria-pressed={open}
      aria-label={
        open
          ? `${stock.symbol} details — tap to open full chart`
          : `${stock.symbol} ${tone.label} signal, price ${inr(stock.price)}`
      }
      className={cn(
        "ticker-card group relative block h-36 select-none rounded-2xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300/70",
        widthClass
      )}
    >
      <span
        className="ticker-tilt"
        style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }}
      >
        <span className={cn("ticker-flip block h-full w-full", open && "is-open")}>
          <span
            className={cn(
              "ticker-face block rounded-2xl border p-4",
              tone.card,
              tone.hover,
              tone.shadow
            )}
          >
            <span className="flex h-full flex-col justify-between">
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold tracking-wide text-zinc-50">
                    {stock.symbol}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-zinc-400">
                    {stock.name && stock.name !== stock.symbol ? stock.name : "\u00A0"}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wide",
                    tone.badge
                  )}
                >
                  {tone.label}
                </span>
              </span>
              <span className="block">
                <span className="flex items-baseline gap-2">
                  <span className="text-xl font-bold tabular-nums tracking-tight text-zinc-50">
                    {inr(stock.price)}
                  </span>
                  <span
                    className={cn(
                      "text-sm font-semibold tabular-nums",
                      tone.text
                    )}
                  >
                    {pct(stock.changePct)}
                  </span>
                </span>
              </span>
            </span>
          </span>

          <span
            className={cn(
              "ticker-face ticker-face--back block rounded-2xl border p-4",
              tone.card,
              tone.hover,
              tone.shadow
            )}
          >
            <span className="flex h-full flex-col justify-between">
              <span className="block">
                <span className="mb-3 block text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Entry / Target / Stop
                </span>
                <span className="block space-y-2 text-sm">
                  <span className="flex items-baseline justify-between">
                    <span className="text-zinc-500">Entry</span>
                    <span className="font-semibold tabular-nums text-zinc-50">
                      {inr(stock.entry)}
                    </span>
                  </span>
                  <span className="flex items-baseline justify-between">
                    <span className="text-zinc-500">Target</span>
                    <span className={cn("font-semibold tabular-nums", tone.target)}>
                      {inr(stock.target)}
                    </span>
                  </span>
                  <span className="flex items-baseline justify-between">
                    <span className="text-zinc-500">Stop</span>
                    <span className="font-semibold tabular-nums text-zinc-50">
                      {inr(stock.stop)}
                    </span>
                  </span>
                </span>
              </span>
              <span className="block border-t border-zinc-800 pt-2 text-center text-[10px] font-medium uppercase tracking-wide text-zinc-600 group-hover:text-zinc-400">
                Tap for chart & RSI →
              </span>
            </span>
          </span>
        </span>
      </span>
    </button>
  );
}

const REFRESH_MS = 10_000;

type Source = "loading" | "live" | "demo" | "empty";

type TickerProps = {
  /** Static sample data used for the preview and as a fallback when the API is down. */
  fallback: TickerStock[];
  /** When false (landing preview), render the fallback without fetching or polling. */
  live?: boolean;
  /** Cap the number of cards shown (used for the landing preview). */
  max?: number;
};

export function Ticker({ fallback, live = false, max }: TickerProps) {
  const [paused, setPaused] = useState(false);
  const [openSymbol, setOpenSymbol] = useState<string | null>(null);
  const [modalStock, setModalStock] = useState<TickerStock | null>(null);
  const [signals, setSignals] = useState<TickerStock[]>(() =>
    live ? fallback : fallback.slice(0, max)
  );
  const [source, setSource] = useState<Source>(live ? "loading" : "demo");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const displayed = live ? signals : fallback.slice(0, max);
  const animate = displayed.length >= 5;

  useEffect(() => {
    if (!live) return;
    let cancelled = false;

    const load = async () => {
      const data = await fetchSignals();
      if (cancelled) return;
      if (data) {
        setLastUpdated(new Date(data.generatedAt));
        setSignals(data.signals);
        setSource(data.signals.length > 0 ? "live" : "empty");
      } else {
        setSignals(fallback);
        setSource("demo");
      }
    };

    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [live, fallback]);

  const handleCardToggle = (symbol: string) => {
    if (openSymbol === symbol) {
      setOpenSymbol(null);
      setPaused(false);
    } else {
      setOpenSymbol(symbol);
      setPaused(true);
    }
  };

  const handleExpand = (symbol: string) => {
    const stock = displayed.find((s) => s.symbol === symbol) ?? null;
    setModalStock(stock);
    setPaused(true);
  };

  const handleModalClose = () => {
    setModalStock(null);
    setOpenSymbol(null);
    setPaused(false);
  };

  const noopExpand = () => {};

  const handlePauseToggle = () => {
    if (paused) setOpenSymbol(null);
    setPaused((p) => !p);
  };

  const durationVar = {
    "--ticker-duration": `${Math.max(displayed.length * 4, 40)}s`,
  } as CSSProperties;

  return (
    <section
      id="ticker"
      aria-label="Swing trade signals"
      className="scroll-mt-24"
    >
      <div className="rounded-3xl border border-zinc-800 bg-gradient-to-b from-zinc-900/70 to-zinc-950 p-5 md:p-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
              <span className="relative flex h-2 w-2">
                <span
                  className={cn(
                    "absolute inline-flex h-full w-full rounded-full opacity-50",
                    source === "live" && "animate-ping bg-emerald-400",
                    source === "demo" && "bg-amber-400",
                    source === "empty" && "bg-zinc-500",
                    source === "loading" && "bg-zinc-500"
                  )}
                />
                <span
                  className={cn(
                    "relative inline-flex h-2 w-2 rounded-full",
                    source === "live" && "bg-emerald-400",
                    source === "demo" && "bg-amber-400",
                    source === "empty" && "bg-zinc-500",
                    source === "loading" && "bg-zinc-500"
                  )}
                />
              </span>
              {!live && "Sample preview"}
              {live && source === "live" && "Live feed"}
              {live && source === "demo" && "Sample data"}
              {live && source === "empty" && "No active signals"}
              {live && source === "loading" && "Connecting…"}
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-zinc-50 md:text-2xl">
              Swing signals on Indian large-caps
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              {!live
                ? "A taste of the feed — sign in for the live version. Tap any card to inspect entry, target, stop and days to exit."
                : source === "demo"
                  ? "API unreachable — showing sample data. Tap any card to inspect entry, target, stop and days to exit."
                  : "Tap any card to inspect entry, target, stop and days to exit."}
              {live && source === "live" && lastUpdated
                ? ` · refreshed ${lastUpdated.toLocaleTimeString()}`
                : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={handlePauseToggle}
            aria-pressed={!paused}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-4 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-500 hover:text-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300/60"
          >
            {paused ? (
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
                <path d="M4 2l9 6-9 6V2z" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
                <path d="M3 2h3v12H3zM10 2h3v12h-3z" />
              </svg>
            )}
            {paused ? "Resume" : "Pause"}
          </button>
        </div>

        {displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 px-6 py-16 text-center">
            <p className="text-sm text-zinc-300">No active signals right now</p>
            <p className="mt-1 text-sm text-zinc-500">
              The feed refreshes automatically once new signals are ingested.
            </p>
          </div>
        ) : (
        <div style={durationVar}>
          <div className="hidden md:block">
            <div className="ticker-viewport py-2">
              <div className={cn("ticker-track", paused && "is-paused", !animate && "ticker-track--static")}>
                {displayed.map((s) => (
                  <div key={`h-a-${s.symbol}`} className="px-2">
                    <TickerCard
                      stock={s}
                      open={openSymbol === s.symbol}
                      onToggle={handleCardToggle}
                      onExpand={handleExpand}
                      widthClass="w-64"
                    />
                  </div>
                ))}
                {animate && (
                  <div className="ticker-dup" inert aria-hidden="true">
                    {displayed.map((s) => (
                      <div key={`h-b-${s.symbol}`} className="px-2">
                        <TickerCard
                          stock={s}
                          open={false}
                          onToggle={handleCardToggle}
                          onExpand={noopExpand}
                          widthClass="w-64"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="md:hidden">
            <div className="ticker-viewport--vertical py-2">
              <div
                className={cn(
                  "ticker-track ticker-track--vertical",
                  paused && "is-paused",
                  !animate && "ticker-track--static"
                )}
              >
                {displayed.map((s) => (
                  <div key={`v-a-${s.symbol}`} className="w-full py-1.5">
                    <TickerCard
                      stock={s}
                      open={openSymbol === s.symbol}
                      onToggle={handleCardToggle}
                      onExpand={handleExpand}
                    />
                  </div>
                ))}
                {animate && (
                  <div className="ticker-dup" inert aria-hidden="true">
                    {displayed.map((s) => (
                      <div key={`v-b-${s.symbol}`} className="w-full py-1.5">
                        <TickerCard
                          stock={s}
                          open={false}
                          onToggle={handleCardToggle}
                          onExpand={noopExpand}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        )}
      </div>
      {modalStock && (
        <SignalDetailModal
          key={modalStock.symbol}
          stock={modalStock}
          onClose={handleModalClose}
          guest={!live}
        />
      )}
    </section>
  );
}