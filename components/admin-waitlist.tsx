"use client";

import { useState } from "react";

export type WaitlistRow = {
  email: string;
  source: string | null;
  createdAt: string;
  invitedAt: string | null;
};

const btnCls =
  "rounded-md px-2.5 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50";

// Explicit locale + format — Date#toLocaleString() with no args uses the
// runtime's default locale, which differs between the server (Node's
// system locale) and the browser (the visitor's locale), producing
// different strings for the same Date and triggering a hydration mismatch.
// Pinning both to "en-IN" keeps SSR and the client in agreement.
function dateTimeFmt(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminWaitlist({ rows: initial }: { rows: WaitlistRow[] }) {
  const [rows, setRows] = useState<WaitlistRow[]>(initial);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  async function invite(email: string) {
    setError(null);
    setBusy((b) => new Set(b).add(email));
    try {
      const res = await fetch("/api/admin/waitlist/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "invite failed");
      setRows((prev) =>
        prev.map((r) => (r.email === email ? { ...r, invitedAt: new Date().toISOString() } : r))
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy((b) => {
        const next = new Set(b);
        next.delete(email);
        return next;
      });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}
      <section className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[600px] border-collapse text-left text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2.5">Email</th>
              <th className="px-3 py-2.5">Source</th>
              <th className="px-3 py-2.5">Joined</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-zinc-500">
                  No signups yet. Share your /waitlist link to get started.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.email} className="bg-zinc-950">
                <td className="px-3 py-2.5 text-zinc-200">{r.email}</td>
                <td className="px-3 py-2.5 text-xs text-zinc-400">{r.source ?? "—"}</td>
                <td className="px-3 py-2.5 text-xs text-zinc-400">
                  {dateTimeFmt(r.createdAt)}
                </td>
                <td className="px-3 py-2.5">
                  {r.invitedAt ? (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-400 ring-1 ring-inset ring-emerald-400/30">
                      invited
                    </span>
                  ) : (
                    <span className="rounded-full bg-zinc-700/40 px-2 py-0.5 text-[11px] font-medium text-zinc-400 ring-1 ring-inset ring-zinc-500/30">
                      not invited
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <button
                    className={`${btnCls} border ${
                      r.invitedAt
                        ? "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                        : "border-emerald-600/50 text-emerald-400 hover:bg-emerald-500/10"
                    }`}
                    disabled={busy.has(r.email)}
                    onClick={() => invite(r.email)}
                  >
                    {r.invitedAt ? "Re-invite" : "Invite"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
