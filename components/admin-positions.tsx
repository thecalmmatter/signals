"use client";

import { useMemo, useState } from "react";
import {
  type AdminPosition,
  STATUS_STYLE,
  STATUS_LABEL,
  daysHeld,
  returnPct,
} from "@/lib/positions-admin";

const inputCls =
  "w-24 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 outline-none transition focus:border-zinc-600";

const btnCls =
  "rounded-md px-2 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50";

type Draft = {
  entry: string;
  target: string;
  target2: string;
  target3: string;
  stop: string;
  exit: string;
  notes: string;
};
type AddForm = {
  symbol: string;
  direction: "buy" | "sell";
  entry: string;
  target: string;
  target2: string;
  target3: string;
  stop: string;
  openedAt: string;
  notes: string;
};

const emptyAddForm: AddForm = {
  symbol: "",
  direction: "buy",
  entry: "",
  target: "",
  target2: "",
  target3: "",
  stop: "",
  openedAt: "",
  notes: "",
};

function draftFrom(p: AdminPosition): Draft {
  return {
    entry: p.entryPrice?.toString() ?? "",
    target: p.targetPrice?.toString() ?? "",
    target2: p.targetPrice2?.toString() ?? "",
    target3: p.targetPrice3?.toString() ?? "",
    stop: p.stopPrice?.toString() ?? "",
    exit: p.exitPrice?.toString() ?? "",
    notes: p.notes ?? "",
  };
}

// One target's price input + independent hit toggle — used for T1/T2/T3.
// Hitting a target doesn't change the position's overall status (that's
// still driven by the Hit target/Hit stop/Close buttons) — this is purely
// "did price reach this waypoint," tracked per-target.
function TargetCell({
  value,
  onChange,
  hitAt,
  onToggleHit,
  busy,
}: {
  value: string;
  onChange: (v: string) => void;
  hitAt: string | null;
  onToggleHit: (hit: boolean) => void;
  busy: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <input
        className={inputCls}
        type="number"
        step="any"
        placeholder="—"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value !== "" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onToggleHit(!hitAt)}
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
            hitAt
              ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-inset ring-emerald-400/30"
              : "border border-zinc-700 text-zinc-500 hover:border-zinc-600 hover:text-zinc-400"
          }`}
          title={hitAt ? `Hit ${new Date(hitAt).toLocaleDateString("en-IN")} — click to unmark` : "Mark as hit"}
        >
          {hitAt ? "hit ✓" : "mark hit"}
        </button>
      )}
    </div>
  );
}

export default function AdminPositions({
  positions,
  livePrices = {},
}: {
  positions: AdminPosition[];
  /** symbol -> live LTP, for open positions' return %. See loadLivePrices in app/dashboard/admin/page.tsx. */
  livePrices?: Record<string, number>;
}) {
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
    const returns = rows
      .map((r) => returnPct(r, livePrices[r.symbol]))
      .filter((v): v is number => v !== null);
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : null;
    return {
      total: rows.length,
      open: rows.filter((r) => r.status === "open").length,
      wins,
      losses,
      winRate,
      avgReturn,
      avgReturnCount: returns.length,
    };
  }, [rows, livePrices]);

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
        targetPrice2: d.target2 === "" ? null : Number(d.target2),
        targetPrice3: d.target3 === "" ? null : Number(d.target3),
        stopPrice: d.stop === "" ? null : Number(d.stop),
        exitPrice: d.exit === "" ? null : Number(d.exit),
        notes: d.notes,
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function toggleTargetHit(id: string, target: 1 | 2 | 3, hit: boolean) {
    setError(null);
    try {
      await patch(id, { [`target${target}Hit`]: hit });
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
          targetPrice2: addForm.target2 === "" ? null : Number(addForm.target2),
          targetPrice3: addForm.target3 === "" ? null : Number(addForm.target3),
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
        {stats.avgReturn !== null && (
          <span
            className={`rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 ${
              stats.avgReturn >= 0 ? "text-emerald-400" : "text-red-400"
            }`}
            title="Open positions use live price, closed use exit price. Positions with no price yet (Fyers down/unconfigured) are excluded."
          >
            {stats.avgReturn >= 0 ? "+" : ""}
            {stats.avgReturn.toFixed(1)}% avg return ({stats.avgReturnCount} of {stats.total})
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
            Target (T1)
            <input
              className={inputCls}
              type="number"
              step="any"
              value={addForm.target}
              onChange={(e) => setAddForm((f) => ({ ...f, target: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            T2 <span className="text-zinc-600">(optional)</span>
            <input
              className={inputCls}
              type="number"
              step="any"
              value={addForm.target2}
              onChange={(e) => setAddForm((f) => ({ ...f, target2: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            T3 <span className="text-zinc-600">(optional)</span>
            <input
              className={inputCls}
              type="number"
              step="any"
              value={addForm.target3}
              onChange={(e) => setAddForm((f) => ({ ...f, target3: e.target.value }))}
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
        <table className="w-full min-w-[1200px] border-collapse text-left text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2.5">Symbol</th>
              <th className="px-3 py-2.5">Dir</th>
              <th className="px-3 py-2.5">Source</th>
              <th className="px-3 py-2.5">Posted</th>
              <th className="px-3 py-2.5">Entry</th>
              <th className="px-3 py-2.5">T1</th>
              <th className="px-3 py-2.5">T2</th>
              <th className="px-3 py-2.5">T3</th>
              <th className="px-3 py-2.5">Stop</th>
              <th className="px-3 py-2.5">Exit</th>
              <th className="px-3 py-2.5">Return</th>
              <th className="px-3 py-2.5">Days</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Notes</th>
              <th className="px-3 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {rows.length === 0 && (
              <tr>
                <td colSpan={15} className="px-3 py-8 text-center text-zinc-500">
                  No positions logged yet.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const d = drafts[r.id];
              const closed = r.status !== "open";
              const ret = returnPct(r, livePrices[r.symbol]);
              const days = daysHeld(r.openedAt, r.closedAt);
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
                    <TargetCell
                      value={d?.target ?? ""}
                      onChange={(v) => setDraft(r.id, "target", v)}
                      hitAt={r.target1HitAt}
                      onToggleHit={(hit) => toggleTargetHit(r.id, 1, hit)}
                      busy={busy.has(r.id)}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <TargetCell
                      value={d?.target2 ?? ""}
                      onChange={(v) => setDraft(r.id, "target2", v)}
                      hitAt={r.target2HitAt}
                      onToggleHit={(hit) => toggleTargetHit(r.id, 2, hit)}
                      busy={busy.has(r.id)}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <TargetCell
                      value={d?.target3 ?? ""}
                      onChange={(v) => setDraft(r.id, "target3", v)}
                      hitAt={r.target3HitAt}
                      onToggleHit={(hit) => toggleTargetHit(r.id, 3, hit)}
                      busy={busy.has(r.id)}
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
                  <td
                    className={`px-3 py-2.5 font-medium tabular-nums ${
                      ret === null ? "text-zinc-600" : ret >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                    title={
                      ret === null
                        ? r.status === "open"
                          ? "no live price (Fyers down/unconfigured, or no quote for this symbol)"
                          : "no exit price logged yet"
                        : r.status === "open"
                          ? "vs live price"
                          : "vs logged exit price"
                    }
                  >
                    {ret === null ? "—" : `${ret >= 0 ? "+" : ""}${ret.toFixed(1)}%`}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-zinc-400">{days === null ? "—" : days}</td>
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
