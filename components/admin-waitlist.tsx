"use client";

import { useState } from "react";

export type WaitlistRow = {
  email: string;
  source: string | null;
  createdAt: string;
  invitedAt: string | null;
  blockedAt: string | null;
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

  const setBusyOn = (email: string, on: boolean) =>
    setBusy((b) => {
      const next = new Set(b);
      if (on) next.add(email);
      else next.delete(email);
      return next;
    });

  async function invite(email: string) {
    setError(null);
    setBusyOn(email, true);
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
      setBusyOn(email, false);
    }
  }

  async function setBlocked(email: string, block: boolean) {
    setError(null);
    setBusyOn(email, true);
    try {
      const res = await fetch("/api/admin/waitlist/block", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, block }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      setRows((prev) =>
        prev.map((r) => (r.email === email ? { ...r, blockedAt: block ? new Date().toISOString() : null } : r))
      );
      if (data.clerkWarning) setError(data.clerkWarning);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyOn(email, false);
    }
  }

  async function remove(email: string) {
    if (!window.confirm(`Remove ${email} from the waitlist? This can't be undone.`)) return;
    setError(null);
    setBusyOn(email, true);
    try {
      const res = await fetch("/api/admin/waitlist", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "remove failed");
      setRows((prev) => prev.filter((r) => r.email !== email));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyOn(email, false);
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
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2.5">Email</th>
              <th className="px-3 py-2.5">Source</th>
              <th className="px-3 py-2.5">Joined</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Actions</th>
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
            {rows.map((r) => {
              const busyRow = busy.has(r.email);
              const blocked = Boolean(r.blockedAt);
              return (
                <tr key={r.email} className="bg-zinc-950">
                  <td className="px-3 py-2.5 text-zinc-200">{r.email}</td>
                  <td className="px-3 py-2.5 text-xs text-zinc-400">{r.source ?? "—"}</td>
                  <td className="px-3 py-2.5 text-xs text-zinc-400">{dateTimeFmt(r.createdAt)}</td>
                  <td className="px-3 py-2.5">
                    {blocked ? (
                      <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-medium text-rose-400 ring-1 ring-inset ring-rose-400/30">
                        blocked
                      </span>
                    ) : r.invitedAt ? (
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
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        className={`${btnCls} border ${
                          r.invitedAt
                            ? "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                            : "border-emerald-600/50 text-emerald-400 hover:bg-emerald-500/10"
                        }`}
                        disabled={busyRow || blocked}
                        title={blocked ? "Unblock first to invite" : undefined}
                        onClick={() => invite(r.email)}
                      >
                        {r.invitedAt ? "Re-invite" : "Invite"}
                      </button>
                      <button
                        className={`${btnCls} border ${
                          blocked
                            ? "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                            : "border-amber-600/50 text-amber-400 hover:bg-amber-500/10"
                        }`}
                        disabled={busyRow}
                        onClick={() => setBlocked(r.email, !blocked)}
                        title={
                          blocked
                            ? "Allow inviting this email again"
                            : "Revoke any pending invite and prevent future invites to this email"
                        }
                      >
                        {blocked ? "Unblock" : "Block"}
                      </button>
                      <button
                        className={`${btnCls} border border-zinc-700 text-zinc-500 hover:border-rose-700/60 hover:text-rose-400`}
                        disabled={busyRow}
                        onClick={() => remove(r.email)}
                      >
                        Remove
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
