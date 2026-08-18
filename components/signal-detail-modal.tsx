"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toneOf, type TickerStock } from "@/lib/stocks";
import { TONES } from "@/lib/tone-styles";

const inr = (n: number) =>
  `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 1 })}`;

function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type RsiTip = {
  latest: number;
  prior: number | null;
  rising: boolean;
  above60: boolean;
} | null;

type StockDetail = {
  symbol: string;
  generatedAt: string;
  chart: { time: number; open: number; high: number; low: number; close: number }[];
  rsi: { weekly: RsiTip; daily: RsiTip; hourly: RsiTip; m15: RsiTip };
};

type FetchState =
  | { status: "guest" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: StockDetail };

type ChatMessage = { role: "user" | "assistant"; content: string };

function AskBarLocked() {
  return (
    <Link
      href="/login"
      className="mt-4 flex w-full items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/30 px-3 py-2 text-left text-sm text-zinc-500 transition hover:border-zinc-700 hover:text-zinc-400"
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 fill-current text-zinc-600" aria-hidden="true">
        <path d="M4 7V5a4 4 0 1 1 8 0v2h.5A1.5 1.5 0 0 1 14 8.5v5A1.5 1.5 0 0 1 12.5 15h-9A1.5 1.5 0 0 1 2 13.5v-5A1.5 1.5 0 0 1 3.5 7H4zm1.5 0h5V5a2.5 2.5 0 0 0-5 0v2z" />
      </svg>
      <span className="flex-1">Sign in to ask about this setup</span>
    </Link>
  );
}

function AskBar({ stock, rsi }: { stock: TickerStock; rsi: StockDetail["rsi"] | null }) {
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const openAndFocus = () => {
    setExpanded(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  // Keep the latest message in view as the thread grows — scrolls whichever
  // ancestor (the modal body) is actually scrollable, nested or not.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  const send = async () => {
    const question = input.trim();
    if (!question || sending) return;

    const next = [...messages, { role: "user" as const, content: question }];
    setMessages(next);
    setInput("");
    setSending(true);
    setError(null);

    try {
      const res = await fetch(`/api/stocks/${stock.symbol}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next,
          context: {
            name: stock.name,
            signal: stock.signal,
            price: stock.price,
            entry: stock.entry,
            target: stock.target,
            stop: stock.stop,
            daysToExit: stock.daysToExit,
            rsi: rsi ?? undefined,
          },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail ?? body?.error ?? `status ${res.status}`);
      }
      const data = (await res.json()) as { reply: string };
      setMessages((cur) => [...cur, { role: "assistant", content: data.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to reply");
    } finally {
      setSending(false);
    }
  };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={openAndFocus}
        className="mt-4 flex w-full items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/30 px-3 py-2 text-left text-sm text-zinc-500 transition hover:border-zinc-700 hover:text-zinc-400"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 fill-current text-zinc-600" aria-hidden="true">
          <path d="M2 2h12v9H5l-3 3V2z" />
        </svg>
        <span className="flex-1">Ask about this setup…</span>
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/30 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">Ask about {stock.symbol}</span>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          aria-label="Collapse"
          className="text-zinc-600 hover:text-zinc-300"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
            <path d="M3 6l5 5 5-5H3z" />
          </svg>
        </button>
      </div>

      {messages.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "max-w-[85%] rounded-xl px-3 py-1.5 text-[13px] leading-relaxed",
                m.role === "user"
                  ? "self-end rounded-br-sm bg-zinc-800 text-zinc-200"
                  : "self-start rounded-bl-sm border border-emerald-400/25 bg-emerald-400/[0.08] text-zinc-200"
              )}
            >
              {m.content}
            </div>
          ))}
          {sending && (
            <div className="self-start rounded-xl rounded-bl-sm border border-emerald-400/25 bg-emerald-400/[0.08] px-3 py-1.5 text-[13px] text-zinc-500">
              …
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}

      <div
        ref={bottomRef}
        className="mt-3 flex items-center gap-2 rounded-lg border border-zinc-700 px-2.5 py-1.5 focus-within:border-zinc-500"
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder={messages.length === 0 ? "Ask about this setup…" : "Ask a follow-up…"}
          disabled={sending}
          className="flex-1 bg-transparent text-[13px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
        />
        <button
          type="button"
          onClick={send}
          disabled={sending || !input.trim()}
          aria-label="Send"
          className="text-emerald-400 disabled:text-zinc-700"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4 fill-current" aria-hidden="true">
            <path d="M2 8l12-6-4 6 4 6-12-6z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

const TIMEFRAME_LABELS: Record<keyof StockDetail["rsi"], string> = {
  weekly: "Weekly",
  daily: "Daily",
  hourly: "1H",
  m15: "15m",
};

function RsiBadge({ label, tip }: { label: string; tip: RsiTip }) {
  if (!tip) {
    return (
      <div className="flex flex-col items-center rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</span>
        <span className="mt-1 text-sm text-zinc-600">—</span>
      </div>
    );
  }

  const pass = tip.rising && tip.above60;
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-xl border px-3 py-2",
        pass
          ? "border-emerald-400/40 bg-emerald-400/10"
          : "border-zinc-800 bg-zinc-900/60"
      )}
    >
      <span className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</span>
      <span
        className={cn(
          "mt-1 flex items-center gap-1 text-sm font-semibold tabular-nums",
          pass ? "text-emerald-400" : "text-zinc-300"
        )}
      >
        {tip.latest.toFixed(1)}
        <span aria-hidden="true">{tip.rising ? "↑" : "↓"}</span>
      </span>
      <span className="text-[10px] text-zinc-600">{tip.above60 ? ">60" : "≤60"}</span>
    </div>
  );
}

export function SignalDetailModal({
  stock,
  onClose,
  guest = false,
}: {
  stock: TickerStock;
  onClose: () => void;
  /** True on the unauthenticated landing preview — skip the auth-gated
   *  /api/stocks fetch + chat entirely and show a sign-in CTA instead. */
  guest?: boolean;
}) {
  const [state, setState] = useState<FetchState>(() => (guest ? { status: "guest" } : { status: "loading" }));
  const chartHostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<{ remove: () => void } | null>(null);

  const tone = TONES[toneOf(stock.signal)];

  // Esc to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Fetch chart + RSI data. Guest views never call the auth-gated route.
  useEffect(() => {
    if (guest) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/stocks/${stock.symbol}`, { cache: "no-store" });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.detail ?? body?.error ?? `status ${res.status}`);
        }
        const data = (await res.json()) as StockDetail;
        if (!cancelled) setState({ status: "ready", data });
      } catch (err) {
        if (!cancelled) {
          setState({
            status: "error",
            message: err instanceof Error ? err.message : "failed to load",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [stock.symbol, guest]);

  // Render candle chart once data is ready. lightweight-charts touches the
  // DOM/canvas directly, so it's dynamically imported (client-only) and torn
  // down on unmount/re-fetch.
  useEffect(() => {
    if (state.status !== "ready" || !chartHostRef.current) return;
    let disposed = false;

    (async () => {
      const { createChart } = await import("lightweight-charts");
      if (disposed || !chartHostRef.current) return;

      const host = chartHostRef.current;
      host.innerHTML = "";

      const chart = createChart(host, {
        width: host.clientWidth,
        height: host.clientHeight,
        layout: { background: { color: "transparent" }, textColor: "#a1a1aa" },
        grid: {
          vertLines: { color: "#27272a" },
          horzLines: { color: "#27272a" },
        },
        timeScale: { borderColor: "#3f3f46" },
        rightPriceScale: { borderColor: "#3f3f46" },
      });

      const series = chart.addCandlestickSeries({
        upColor: "#34d399",
        downColor: "#fb7185",
        borderVisible: false,
        wickUpColor: "#34d399",
        wickDownColor: "#fb7185",
      });

      series.setData(
        state.data.chart.map((c) => ({
          time: c.time as unknown as import("lightweight-charts").UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }))
      );
      chart.timeScale().fitContent();

      const onResize = () => chart.applyOptions({ width: host.clientWidth });
      window.addEventListener("resize", onResize);

      chartRef.current = {
        remove: () => {
          window.removeEventListener("resize", onResize);
          chart.remove();
        },
      };
    })();

    return () => {
      disposed = true;
      chartRef.current?.remove();
      chartRef.current = null;
    };
  }, [state]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${stock.symbol} detail`}
    >
      <div
        className={cn(
          "flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border bg-zinc-950 shadow-2xl",
          tone.card
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 p-5 pb-0 md:p-6 md:pb-0">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-zinc-50">{stock.symbol}</h3>
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wide",
                  tone.badge
                )}
              >
                {tone.label}
              </span>
            </div>
            <p className="text-sm text-zinc-500">{stock.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full border border-zinc-700 p-1.5 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300/60"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4 fill-current" aria-hidden="true">
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 pt-4 md:p-6 md:pt-4">
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-bold tabular-nums text-zinc-50">{inr(stock.price)}</span>
          </div>

          <div ref={chartHostRef} className="mt-4 h-64 w-full rounded-2xl border border-zinc-800 bg-zinc-900/40 md:h-80">
            {state.status === "guest" && (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
                <svg viewBox="0 0 16 16" className="h-5 w-5 fill-current text-zinc-600" aria-hidden="true">
                  <path d="M4 7V5a4 4 0 1 1 8 0v2h.5A1.5 1.5 0 0 1 14 8.5v5A1.5 1.5 0 0 1 12.5 15h-9A1.5 1.5 0 0 1 2 13.5v-5A1.5 1.5 0 0 1 3.5 7H4zm1.5 0h5V5a2.5 2.5 0 0 0-5 0v2z" />
                </svg>
                <p className="text-sm text-zinc-300">Sign in to see the live chart & RSI cascade</p>
                <Link
                  href="/login"
                  className="mt-1 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-zinc-500 hover:text-zinc-50"
                >
                  Sign in
                </Link>
              </div>
            )}
            {state.status === "loading" && (
              <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                Loading chart…
              </div>
            )}
            {state.status === "error" && (
              <div className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center">
                <p className="text-sm text-zinc-300">Chart unavailable</p>
                <p className="text-xs text-zinc-500">{state.message}</p>
              </div>
            )}
          </div>

          <div className="mt-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              RSI(14) cascade
            </p>
            <div className="grid grid-cols-4 gap-2">
              {state.status === "ready"
                ? (Object.keys(TIMEFRAME_LABELS) as (keyof StockDetail["rsi"])[]).map((key) => (
                    <RsiBadge key={key} label={TIMEFRAME_LABELS[key]} tip={state.data.rsi[key]} />
                  ))
                : (Object.keys(TIMEFRAME_LABELS) as (keyof StockDetail["rsi"])[]).map((key) => (
                    <RsiBadge key={key} label={TIMEFRAME_LABELS[key]} tip={null} />
                  ))}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-zinc-800 pt-4 text-sm">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">Entry</p>
              <p className="font-semibold tabular-nums text-zinc-50">{inr(stock.entry)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">Target</p>
              <p className={cn("font-semibold tabular-nums", tone.target)}>{inr(stock.target)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">Stop</p>
              <p className="font-semibold tabular-nums text-zinc-50">{inr(stock.stop)}</p>
            </div>
          </div>

          {guest ? (
            <AskBarLocked />
          ) : (
            <AskBar stock={stock} rsi={state.status === "ready" ? state.data.rsi : null} />
          )}
        </div>
      </div>
    </div>
  );
}
