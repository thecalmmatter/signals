"use client";

import { useState } from "react";

type ScanMapping = {
  scanUrl: string;
  scanName: string | null;
  signalType: "buy" | "sell";
  active: boolean;
};

const btnCls =
  "rounded-md px-2 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50";
const inputCls =
  "rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 outline-none transition focus:border-zinc-600";

export default function AdminScanMappings({ initial }: { initial: ScanMapping[] }) {
  const [mappings, setMappings] = useState<ScanMapping[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<{ scanUrl: string; scanName: string; signalType: "buy" | "sell" }>({
    scanUrl: "",
    scanName: "",
    signalType: "buy",
  });

  async function act(path: string, method: string, body?: Record<string, unknown>) {
    const res = await fetch(path, {
      method,
      headers: { "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "request failed");
    return data;
  }

  async function add() {
    setError(null);
    try {
      const { mapping } = await act("/api/scan-mappings", "POST", {
        scanUrl: form.scanUrl,
        scanName: form.scanName,
        signalType: form.signalType,
        active: true,
      });
      setMappings((prev) => [...prev.filter((m) => m.scanUrl !== mapping.scanUrl), mapping]);
      setForm({ scanUrl: "", scanName: "", signalType: form.signalType });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function patch(m: ScanMapping, patchBody: Partial<ScanMapping>) {
    setError(null);
    try {
      const { mapping } = await act(`/api/scan-mappings/${encodeURIComponent(m.scanUrl)}`, "PATCH", patchBody);
      setMappings((prev) => prev.map((x) => (x.scanUrl === m.scanUrl ? mapping : x)));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(m: ScanMapping) {
    if (!window.confirm(`Remove scan mapping "${m.scanUrl}"? Real alerts for it will be skipped as unmapped_scan.`)) return;
    setError(null);
    try {
      await act(`/api/scan-mappings/${encodeURIComponent(m.scanUrl)}`, "DELETE");
      setMappings((prev) => prev.filter((x) => x.scanUrl !== m.scanUrl));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <h2 className="mb-1 text-sm font-semibold text-zinc-200">Chartlink scan mappings</h2>
      <p className="mb-4 text-xs text-zinc-500">
        Maps a Chartlink <code>scan_url</code> to its direction (buy/sell). Inactive or missing scans are skipped as{" "}
        <code>unmapped_scan</code>. Add a new scan here after registering it in Chartlink.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">{error}</div>
      )}

      {/* Add form */}
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          scan_url (slug)
          <input className={`${inputCls} w-44`} value={form.scanUrl} onChange={(e) => setForm((f) => ({ ...f, scanUrl: e.target.value }))} placeholder="manish-goel-scan" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Display name
          <input className={`${inputCls} w-40`} value={form.scanName} onChange={(e) => setForm((f) => ({ ...f, scanName: e.target.value }))} placeholder="Manish Goel Scan" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Direction
          <select className={`${inputCls} w-24`} value={form.signalType} onChange={(e) => setForm((f) => ({ ...f, signalType: e.target.value as "buy" | "sell" }))}>
            <option value="buy">buy</option>
            <option value="sell">sell</option>
          </select>
        </label>
        <button className={`${btnCls} bg-emerald-600 px-3 py-1.5 text-white hover:bg-emerald-500`} onClick={add}>
          Add mapping
        </button>
      </div>

      {/* List */}
      <table className="w-full border-collapse text-left text-sm">
        <thead className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-3 py-2">scan_url</th>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Direction</th>
            <th className="px-3 py-2">Active</th>
            <th className="px-3 py-2">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/60">
          {mappings.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-zinc-500">
                No scan mappings yet.
              </td>
            </tr>
          )}
          {mappings.map((m) => (
            <tr key={m.scanUrl} className={m.active ? "" : "opacity-50"}>
              <td className="px-3 py-2 font-mono text-xs text-zinc-200">{m.scanUrl}</td>
              <td className="px-3 py-2 text-zinc-300">{m.scanName ?? "—"}</td>
              <td className="px-3 py-2">
                <div className="flex gap-1">
                  <button
                    className={`${btnCls} border ${m.signalType === "buy" ? "border-emerald-500 bg-emerald-500/15 text-emerald-400" : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"}`}
                    onClick={() => patch(m, { signalType: "buy" })}
                  >
                    buy
                  </button>
                  <button
                    className={`${btnCls} border ${m.signalType === "sell" ? "border-red-500 bg-red-500/15 text-red-400" : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"}`}
                    onClick={() => patch(m, { signalType: "sell" })}
                  >
                    sell
                  </button>
                </div>
              </td>
              <td className="px-3 py-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                    m.active ? "bg-emerald-500/15 text-emerald-400 ring-emerald-400/30" : "bg-zinc-700/40 text-zinc-400 ring-zinc-500/30"
                  }`}
                >
                  {m.active ? "active" : "inactive"}
                </span>
              </td>
              <td className="px-3 py-2">
                <div className="flex gap-1.5">
                  <button
                    className={`${btnCls} border border-zinc-700 text-zinc-300 hover:bg-zinc-800`}
                    onClick={() => patch(m, { active: !m.active })}
                  >
                    {m.active ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    className={`${btnCls} border border-red-600/50 text-red-400 hover:bg-red-500/10`}
                    onClick={() => remove(m)}
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}