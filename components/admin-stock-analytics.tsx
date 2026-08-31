"use client";

import { useState } from "react";
import Link from "next/link";

export type StockAnalyticsRow = {
  symbol: string;
  hasData: boolean;
  fetchedAt: string | null;
  error: string | null;
};

const btnCls =
  "rounded-md border px-2.5 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50";

function dateTimeFmt(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ row }: { row: StockAnalyticsRow }) {
  if (row.fetchedAt === null) {
    return (
      <span className="rounded-full bg-zinc-700/40 px-2 py-0.5 text-[11px] font-medium text-zinc-400 ring-1 ring-inset ring-zinc-500/30">
        never fetched
      </span>
    );
  }
  if (row.hasData) {
    return (
      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-400 ring-1 ring-inset ring-emerald-400/30">
        cached
      </span>
    );
  }
  return (
    <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-medium text-rose-400 ring-1 ring-inset ring-rose-400/30">
      failed
    </span>
  );
}

export default function AdminStockAnalytics({
  rows: initial,
  configured,
}: {
  rows: StockAnalyticsRow[];
  configured: boolean;
}) {
  const [rows, setRows] = useState<StockAnalyticsRow[]>(initial);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [busyAll, setBusyAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setBusyOn = (symbol: string, on: boolean) =>
    setBusy((b) => {
      const next = new Set(b);
      if (on) next.add(symbol);
      else next.delete(symbol);
      return next;
    });

  async function refreshOne(symbol: string) {
    setError(null);
    setBusyOn(symbol, true);
    try {
      const res = await fetch("/api/admin/stock-analytics/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      const data = await res.json();
      setRows((prev) =>
        prev.map((r) =>
          r.symbol === symbol
            ? { ...r, hasData: Boolean(data.ok), fetchedAt: new Date().toISOString(), error: data.error ?? null }
            : r
        )
      );
      if (!res.ok && !data.ok) setError(`${symbol}: ${data.error ?? "refresh failed"}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyOn(symbol, false);
    }
  }

  async function refreshAll() {
    setError(null);
    setBusyAll(true);
    try {
      const res = await fetch("/api/admin/stock-analytics/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "refresh all failed");
      const results = data.results as { symbol: string; ok: boolean; error?: string }[];
      setRows((prev) =>
        prev.map((r) => {
          const found = results.find((x) => x.symbol === r.symbol);
          if (!found) return r;
          return { ...r, hasData: found.ok, fetchedAt: new Date().toISOString(), error: found.error ?? null };
        })
      );
      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) setError(`${failed.length} of ${results.length} symbols failed to refresh`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyAll(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {!configured && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-400">
          INDIAN_STOCK_API_KEY isn&apos;t set — the pipeline has nothing to fetch with. Set it, then refresh.
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500">
          {rows.length} active symbol{rows.length === 1 ? "" : "s"} · analytics data for{" "}
          <Link href="/dashboard/stocks" className="underline decoration-zinc-700 underline-offset-2 hover:text-zinc-300">
            /dashboard/stocks
          </Link>
        </p>
        <button
          type="button"
          className={`${btnCls} border-emerald-600/50 text-emerald-400 hover:bg-emerald-500/10`}
          disabled={busyAll || !configured || rows.length === 0}
          onClick={refreshAll}
        >
          {busyAll ? "Refreshing all…" : "Refresh all"}
        </button>
      </div>
      <section className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2.5">Symbol</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Last attempt</th>
              <th className="px-3 py-2.5">Error</th>
              <th className="px-3 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-zinc-500">
                  No active signals right now — nothing to populate yet.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const busyRow = busy.has(r.symbol);
              return (
                <tr key={r.symbol} className="bg-zinc-950">
                  <td className="px-3 py-2.5 font-medium text-zinc-200">
                    <Link
                      href={`/dashboard/stocks/${r.symbol}`}
                      className="hover:text-emerald-400"
                    >
                      {r.symbol}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge row={r} />
                  </td>
                  <td className="px-3 py-2.5 text-xs text-zinc-400">
                    {r.fetchedAt ? dateTimeFmt(r.fetchedAt) : "—"}
                  </td>
                  <td className="max-w-[280px] truncate px-3 py-2.5 text-xs text-rose-400" title={r.error ?? undefined}>
                    {r.error ?? "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      className={`${btnCls} border-zinc-700 text-zinc-300 hover:bg-zinc-800`}
                      disabled={busyRow || busyAll || !configured}
                      onClick={() => refreshOne(r.symbol)}
                    >
                      {busyRow ? "Refreshing…" : "Refresh"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
