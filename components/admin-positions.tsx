"use client";

import { useMemo, useState } from "react";
import type { AdminPosition } from "@/lib/positions-admin";

const STATUS_STYLE: Record<string, string> = {
  open: "bg-sky-500/15 text-sky-400 ring-sky-400/30",
  hit_target: "bg-emerald-500/15 text-emerald-400 ring-emerald-400/30",
  hit_stop: "bg-red-500/15 text-red-400 ring-red-400/30",
  closed_manual: "bg-zinc-700/40 text-zinc-400 ring-zinc-500/30",
};

const STATUS_LABEL: Record<string, string> = {
  open: "open",
  hit_target: "hit target",
  hit_stop: "hit stop",
  closed_manual: "closed (manual)",
};

const inputCls =
  "w-24 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 outline-none transition focus:border-zinc-600";

const btnCls =
  "rounded-md px-2 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50";

type Draft = { entry: string; target: string; stop: string; exit: string; notes: string };
type AddForm = {
  symbol: string;
  direction: "buy" | "sell";
  entry: string;
  target: string;
  stop: string;
  openedAt: string;
  notes: string;
};

const emptyAddForm: AddForm = {
  symbol: "",
  direction: "buy",
  entry: "",
  target: "",
  stop: "",
  openedAt: "",
  notes: "",
};

function draftFrom(p: AdminPosition): Draft {
  return {
    entry: p.entryPrice?.toString() ?? "",
    target: p.targetPrice?.toString() ?? "",
    stop: p.stopPrice?.toString() ?? "",
    exit: p.exitPrice?.toString() ?? "",
    notes: p.notes ?? "",
  };
}

export default function AdminPositions({ positions }: { positions: AdminPosition[] }) {
  const [rows, setRows] = useState<AdminPosition[]>(positions);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(positions.map((p) => [p.id, draftFrom(p)]))
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [addForm, setAddForm] = useState<AddForm>(emptyAddForm);
  const [adding, setAdding] = useState(false);

  const stats = useMemo(() => {
    const closed = rows.filter((r) => r.status !== "open");
    const wins = rows.filter((r) => r.status === "hit_target").length;
    const losses = rows.filter((r) => r.status === "hit_stop").length;
    const winRate = closed.length > 0 ? (wins / closed.length) * 100 : null;
    return { total: rows.length, open: rows.filter((r) => r.status === "open").length, wins, losses, winRate };
  }, [rows]);

  const setDraft = (id: string, key: keyof Draft, value: string) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id], [key]: value } }));

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy((b) => new Set(b).add(id));
    try {
      const res = await fetch(`/api/admin/positions/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "request failed");
      setRows((prev) => prev.map((r) => (r.id === id ? data.position : r)));
      setDrafts((d) => ({ ...d, [id]: draftFrom(data.position) }));
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
        exitPrice: d.exit === "" ? null : Number(d.exit),
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
    if (!window.confirm("Delete this position from the ledger? This can't be undone.")) return;
    setError(null);
    const res = await fetch(`/api/admin/positions/${id}`, { method: "DELETE" });
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

  async function addPosition() {
    setError(null);
    if (!addForm.symbol.trim()) return setError("symbol is required");
    if (addForm.entry === "" || addForm.target === "" || addForm.stop === "") {
      return setError("entry, target, and stop are required");
    }
    setAdding(true);
    try {
      const res = await fetch("/api/admin/positions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          symbol: addForm.symbol,
          direction: addForm.direction,
          entryPrice: Number(addForm.entry),
          targetPrice: Number(addForm.target),
          stopPrice: Number(addForm.stop),
          openedAt: addForm.openedAt || null,
          notes: addForm.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "request failed");
      setRows((prev) => [data.position, ...prev]);
      setDrafts((d) => ({ ...d, [data.position.id]: draftFrom(data.position) }));
      setAddForm(emptyAddForm);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-zinc-300">
          {stats.total} logged
        </span>
        <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-sky-400">
          {stats.open} open
        </span>
        <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-emerald-400">
          {stats.wins} target
        </span>
        <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-red-400">
          {stats.losses} stop
        </span>
        {stats.winRate !== null && (
          <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-zinc-300">
            {stats.winRate.toFixed(0)}% win rate (closed only)
          </span>
        )}
      </div>

      {/* Add manually */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-200">
          Log a position by hand{" "}
          <span className="ml-1 text-xs font-normal text-zinc-500">
            (optional — most rows below fill in on their own once a signal has entry/target/stop.
            Use this only for a call you made outside the signals table.)
          </span>
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
            Direction
            <select
              className={`${inputCls} w-24`}
              value={addForm.direction}
              onChange={(e) => setAddForm((f) => ({ ...f, direction: e.target.value as "buy" | "sell" }))}
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
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Date posted
            <input
              className={`${inputCls} w-36`}
              type="date"
              value={addForm.openedAt}
              onChange={(e) => setAddForm((f) => ({ ...f, openedAt: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Notes
            <input
              className={`${inputCls} w-40`}
              value={addForm.notes}
              onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="optional"
            />
          </label>
          <button
            className={`${btnCls} bg-emerald-600 px-3 py-1.5 text-white hover:bg-emerald-500`}
            disabled={adding}
            onClick={addPosition}
          >
            Log position
          </button>
        </div>
      </section>

      {/* Table */}
      <section className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[1000px] border-collapse text-left text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2.5">Symbol</th>
              <th className="px-3 py-2.5">Dir</th>
              <th className="px-3 py-2.5">Source</th>
              <th className="px-3 py-2.5">Posted</th>
              <th className="px-3 py-2.5">Entry</th>
              <th className="px-3 py-2.5">Target</th>
              <th className="px-3 py-2.5">Stop</th>
              <th className="px-3 py-2.5">Exit</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Notes</th>
              <th className="px-3 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-zinc-500">
                  No positions logged yet.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const d = drafts[r.id];
              const closed = r.status !== "open";
              return (
                <tr key={r.id} className={`bg-zinc-950 transition ${closed ? "opacity-80" : ""}`}>
                  <td className="px-3 py-2.5">
                    <span className="font-medium text-zinc-100">{r.symbol}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                        r.direction === "buy"
                          ? "bg-emerald-500/15 text-emerald-400 ring-emerald-400/30"
                          : "bg-red-500/15 text-red-400 ring-red-400/30"
                      }`}
                    >
                      {r.direction}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                        r.signalId
                          ? "bg-zinc-800/60 text-zinc-400 ring-zinc-700/60"
                          : "bg-sky-500/15 text-sky-400 ring-sky-400/30"
                      }`}
                      title={r.signalId ? `Auto-populated from signal #${r.signalId}` : "Logged by hand"}
                    >
                      {r.signalId ? "auto" : "manual"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-zinc-400">{r.openedAt ?? "—"}</td>
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
                    <input
                      className={inputCls}
                      type="number"
                      step="any"
                      value={d?.exit ?? ""}
                      onChange={(e) => setDraft(r.id, "exit", e.target.value)}
                      placeholder="—"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${STATUS_STYLE[r.status]}`}
                    >
                      {STATUS_LABEL[r.status]}
                    </span>
                    {r.closedAt && <div className="mt-1 text-[10px] text-zinc-600">closed {r.closedAt}</div>}
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
                      {r.status !== "open" ? (
                        <button
                          className={`${btnCls} border border-sky-600/50 text-sky-400 hover:bg-sky-500/10`}
                          disabled={busy.has(r.id)}
                          onClick={() => setStatus(r.id, "open")}
                        >
                          Reopen
                        </button>
                      ) : (
                        <>
                          <button
                            className={`${btnCls} border border-emerald-600/50 text-emerald-400 hover:bg-emerald-500/10`}
                            disabled={busy.has(r.id)}
                            onClick={() => setStatus(r.id, "hit_target")}
                          >
                            Hit target
                          </button>
                          <button
                            className={`${btnCls} border border-red-600/50 text-red-400 hover:bg-red-500/10`}
                            disabled={busy.has(r.id)}
                            onClick={() => setStatus(r.id, "hit_stop")}
                          >
                            Hit stop
                          </button>
                          <button
                            className={`${btnCls} border border-zinc-700 text-zinc-400 hover:bg-zinc-800`}
                            disabled={busy.has(r.id)}
                            onClick={() => setStatus(r.id, "closed_manual")}
                          >
                            Close
                          </button>
                        </>
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
