"use client";

import { useEffect, useState } from "react";

function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type WebhookEvent = {
  id: string;
  eventType: string;
  symbol: string | null;
  stocks: string[];
  triggerDate: string | null;
  scanName: string | null;
  scanUrl: string | null;
  detail: string | null;
  time: string;
};

type FeedResponse = {
  events: WebhookEvent[];
  generatedAt: string;
};

const REFRESH_MS = 10_000;

const META: Record<string, { label: string; badge: string; dot: string }> = {
  trigger: {
    label: "Mapped · signal written",
    badge: "bg-emerald-500/15 text-emerald-400 ring-emerald-400/30",
    dot: "bg-emerald-400",
  },
  unmapped_scan: {
    label: "Unmapped · skipped",
    badge: "bg-amber-500/15 text-amber-400 ring-amber-400/30",
    dot: "bg-amber-400",
  },
  malformed: {
    label: "Malformed · rejected",
    badge: "bg-red-500/15 text-red-400 ring-red-400/30",
    dot: "bg-red-400",
  },
  override_preserved: {
    label: "Override preserved",
    badge: "bg-sky-500/15 text-sky-400 ring-sky-400/30",
    dot: "bg-sky-400",
  },
  manual_created: {
    label: "Manually created",
    badge: "bg-violet-500/15 text-violet-400 ring-violet-400/30",
    dot: "bg-violet-400",
  },
  manual_edited: {
    label: "Manually edited",
    badge: "bg-violet-500/15 text-violet-400 ring-violet-400/30",
    dot: "bg-violet-400",
  },
  suppressed: {
    label: "Suppressed",
    badge: "bg-rose-500/15 text-rose-400 ring-rose-400/30",
    dot: "bg-rose-400",
  },
};

const fallbackMeta = {
  label: "Event",
  badge: "bg-zinc-500/15 text-zinc-400 ring-zinc-400/30",
  dot: "bg-zinc-400",
};

async function fetchEvents(): Promise<WebhookEvent[]> {
  try {
    const res = await fetch("/api/webhook-events", { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as FeedResponse;
    return data.events;
  } catch {
    return [];
  }
}

export function ActivityFeed() {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const next = await fetchEvents();
      if (cancelled) return;
      setEvents(next);
      setLastUpdated(new Date());
    };

    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const symbolsFor = (e: WebhookEvent) => {
    if (e.symbol) return [e.symbol];
    if (e.stocks.length > 0) return e.stocks;
    return [];
  };

  const handleClear = async () => {
    if (!window.confirm("Clear the entire webhook activity feed?")) return;
    try {
      const res = await fetch("/api/webhook-events", { method: "DELETE" });
      if (res.ok) {
        setEvents([]);
        setLastUpdated(new Date());
      }
    } catch {
      // ignore — next poll will show the server state
    }
  };

  return (
    <section className="mt-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-50">
          Incoming webhook activity
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">
            {lastUpdated
              ? `refreshed ${lastUpdated.toLocaleTimeString()}`
              : "watching for alerts…"}
          </span>
          {events.length > 0 && (
            <button
              onClick={handleClear}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-300 transition hover:border-red-500/40 hover:bg-zinc-800 hover:text-red-400"
            >
              Clear feed
            </button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-900/30">
        {events.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-zinc-500">
            No webhook activity yet. Alerts from Chartlink will appear here
            automatically.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-800/60">
            {events.map((e) => {
              const meta = META[e.eventType] ?? fallbackMeta;
              const symbols = symbolsFor(e);
              return (
                <li key={e.id} className="flex items-start gap-3 px-5 py-3">
                  <span
                    className={cn(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                      meta.dot
                    )}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wide ring-1 ring-inset",
                          meta.badge
                        )}
                      >
                        {meta.label}
                      </span>
                      <span className="text-xs font-medium text-zinc-200">
                        {e.scanName ?? e.scanUrl ?? "unknown scan"}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      {symbols.map((s) => (
                        <span
                          key={s}
                          className="rounded bg-zinc-800/70 px-1.5 py-0.5 text-[11px] font-medium text-zinc-300"
                        >
                          {s}
                        </span>
                      ))}
                      {symbols.length === 0 && (
                        <span className="text-[11px] text-zinc-500">
                          no symbols
                        </span>
                      )}
                      {e.detail && (
                        <span className="text-[11px] text-zinc-500">
                          · {e.detail}
                        </span>
                      )}
                    </div>
                  </div>
                  <time
                    className="shrink-0 text-right text-[11px] tabular-nums text-zinc-500"
                    title={e.triggerDate ?? ""}
                  >
                    {e.time}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
