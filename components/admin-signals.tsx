"use client";

import { useState } from "react";
import type { AdminSignal } from "@/lib/signals-admin";

const STATUS_STYLE: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-400 ring-emerald-400/30",
  suppressed: "bg-zinc-700/40 text-zinc-400 ring-zinc-500/30",
  manual_override: "bg-amber-500/15 text-amber-400 ring-amber-400/30",
  expired: "bg-zinc-800 text-zinc-500 ring-zinc-700",
  hit_target: "bg-sky-500/15 text-sky-400 ring-sky-400/30",
  hit_stop: "bg-red-500/15 text-red-400 ring-red-400/30",
};

const inputCls =
  "w-24 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 outline-none transition focus:border-zinc-600";

const btnCls =
  "rounded-md px-2 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50";

type Draft = { entry: string; target: string; stop: string; notes: string };
type AddForm = { symbol: string; type: "buy" | "sell"; entry: string; target: string; stop: string };

export default function AdminSignals({ signals }: { signals: AdminSignal[] }) {
  const [rows, setRows] = useState<AdminSignal[]>(signals);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      signals.map((s) => [
        s.id,
        {
          entry: s.entryPrice?.toString() ?? "",
          target: s.targetPrice?.toString() ?? "",
          stop: s.stopPrice?.toString() ?? "",
          notes: s.notes ?? "",
        },
      ])
    )
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [addForm, setAddForm] = useState<AddForm>({ symbol: "", type: "buy", entry: "", target: "", stop: "" });

  const setDraft = (id: string, key: keyof Draft, value: string) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id], [key]: value } }));

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy((b) => new Set(b).add(id));
    try {
      const res = await fetch(`/api/signals/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "request failed");
      setRows((prev) => prev.map((r) => (r.id === id ? data.signal : r)));
    } finally {
      setBusy((b) => {
        const next = new Set(b);
        next.delete(id);
        return next;
      });
    }
  }

  async function save(id: string) {
    setError(null);
    const d = drafts[id];
    try {
      await patch(id, {
        entryPrice: d.entry === "" ? null : Number(d.entry),
        targetPrice: d.target === "" ? null : Number(d.target),
        stopPrice: d.stop === "" ? null : Number(d.stop),
        notes: d.notes,
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function setStatus(id: string, status: string) {
    setError(null);
    try {
      await patch(id, { status });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this signal? The action is logged, but the row is gone.")) return;
    setError(null);
    const res = await fetch(`/api/signals/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("delete failed");
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
    setDrafts((prev) => {
      const rest = { ...prev };
      delete rest[id];
      return rest;
    });
  }

  async function addSignal() {
    setError(null);
    if (!addForm.symbol.trim()) {
      setError("symbol is required");
      return;
    }
    try {
      const res = await fetch("/api/signals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          symbol: addForm.symbol,
          type: addForm.type,
          entryPrice: addForm.entry === "" ? null : Number(addForm.entry),
          targetPrice: addForm.target === "" ? null : Number(addForm.target),
          stopPrice: addForm.stop === "" ? null : Number(addForm.stop),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "request failed");
      // Server upserts by symbol — if it updated an existing active row
      // (200), replace that row in place instead of prepending a duplicate.
      setRows((prev) => {
        const exists = prev.some((r) => r.id === data.signal.id);
        return exists
          ? prev.map((r) => (r.id === data.signal.id ? data.signal : r))
          : [data.signal, ...prev];
      });
      setDrafts((d) => ({
        ...d,
        [data.signal.id]: {
          entry: data.signal.entryPrice?.toString() ?? "",
          target: data.signal.targetPrice?.toString() ?? "",
          stop: data.signal.stopPrice?.toString() ?? "",
          notes: "",
        },
      }));
      setAddForm({ symbol: "", type: "buy", entry: "", target: "", stop: "" });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Add manually */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-200">
          Add signal manually <span className="ml-1 text-xs font-normal text-zinc-500">(Chartlink never fired on this)</span>
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Symbol
            <input
              className={`${inputCls} w-32 uppercase`}
              value={addForm.symbol}
              onChange={(e) => setAddForm((f) => ({ ...f, symbol: e.target.value }))}
              placeholder="TATAPOWER"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Type
            <select
              className={`${inputCls} w-24`}
              value={addForm.type}
              onChange={(e) => setAddForm((f) => ({ ...f, type: e.target.value as "buy" | "sell" }))}
            >
              <option value="buy">buy</option>
              <option value="sell">sell</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Entry
            <input
              className={inputCls}
              type="number"
              step="any"
              value={addForm.entry}
              onChange={(e) => setAddForm((f) => ({ ...f, entry: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Target
            <input
              className={inputCls}
              type="number"
              step="any"
              value={addForm.target}
              onChange={(e) => setAddForm((f) => ({ ...f, target: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Stop
            <input
              className={inputCls}
              type="number"
              step="any"
              value={addForm.stop}
              onChange={(e) => setAddForm((f) => ({ ...f, stop: e.target.value }))}
            />
          </label>
          <button
            className={`${btnCls} bg-emerald-600 px-3 py-1.5 text-white hover:bg-emerald-500`}
            onClick={addSignal}
          >
            Add signal
          </button>
        </div>
      </section>

      {/* Table */}
      <section className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[900px] border-collapse text-left text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2.5">Symbol</th>
              <th className="px-3 py-2.5">Type</th>
              <th className="px-3 py-2.5">Source</th>
              <th className="px-3 py-2.5">Triggered</th>
              <th className="px-3 py-2.5">Entry</th>
              <th className="px-3 py-2.5">Target</th>
              <th className="px-3 py-2.5">Stop</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Notes</th>
              <th className="px-3 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-zinc-500">
                  No signals yet.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const suppressed = r.status === "suppressed" || r.status === "manual_override";
              const d = drafts[r.id];
              return (
                <tr key={r.id} className={`bg-zinc-950 transition ${suppressed ? "opacity-50" : ""}`}>
                  <td className="px-3 py-2.5">
                    <span className="font-medium text-zinc-100">{r.symbol}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                        r.signalType === "buy"
                          ? "bg-emerald-500/15 text-emerald-400 ring-emerald-400/30"
                          : "bg-red-500/15 text-red-400 ring-red-400/30"
                      }`}
                    >
                      {r.signalType}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-zinc-400">{r.source}</td>
                  <td className="px-3 py-2.5 text-xs text-zinc-400">
                    {r.triggerDate ?? "—"}
                    {r.scanName ? <div className="text-zinc-600">{r.scanName}</div> : null}
                  </td>
                  <td className="px-3 py-2.5">
                    <input
                      className={inputCls}
                      type="number"
                      step="any"
                      value={d?.entry ?? ""}
                      onChange={(e) => setDraft(r.id, "entry", e.target.value)}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <input
                      className={inputCls}
                      type="number"
                      step="any"
                      value={d?.target ?? ""}
                      onChange={(e) => setDraft(r.id, "target", e.target.value)}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <input
                      className={inputCls}
                      type="number"
                      step="any"
                      value={d?.stop ?? ""}
                      onChange={(e) => setDraft(r.id, "stop", e.target.value)}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${STATUS_STYLE[r.status] ?? STATUS_STYLE.expired}`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <input
                      className={`${inputCls} w-40`}
                      value={d?.notes ?? ""}
                      onChange={(e) => setDraft(r.id, "notes", e.target.value)}
                      placeholder="note…"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        className={`${btnCls} border border-zinc-700 text-zinc-300 hover:bg-zinc-800`}
                        disabled={busy.has(r.id)}
                        onClick={() => save(r.id)}
                      >
                        Save
                      </button>
                      {r.status === "active" ? (
                        <button
                          className={`${btnCls} border border-amber-600/50 text-amber-400 hover:bg-amber-500/10`}
                          disabled={busy.has(r.id)}
                          onClick={() => setStatus(r.id, "suppressed")}
                        >
                          Suppress
                        </button>
                      ) : (
                        <button
                          className={`${btnCls} border border-emerald-600/50 text-emerald-400 hover:bg-emerald-500/10`}
                          disabled={busy.has(r.id)}
                          onClick={() => setStatus(r.id, "active")}
                        >
                          Reactivate
                        </button>
                      )}
                      <button
                        className={`${btnCls} border border-red-600/50 text-red-400 hover:bg-red-500/10`}
                        disabled={busy.has(r.id)}
                        onClick={() => remove(r.id)}
                      >
                        Delete
                      </button>
                    </div>
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