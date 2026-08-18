"use client";

import { useState } from "react";

type AdminUser = {
  id: string;
  email: string;
  subscriptionStatus: string;
  trialEndsAt: string | null;
  razorpaySubscriptionId: string | null;
  createdAt: string;
};

const inputCls =
  "rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 outline-none transition focus:border-zinc-600";

const btnCls =
  "rounded-md px-2 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 border border-zinc-700 text-zinc-300 hover:bg-zinc-800";

// <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm"; DB gives back an
// ISO string with seconds/offset — trim to what the input accepts.
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminBilling({
  initialUsers,
  initialDefaultTrialEndsAt,
}: {
  initialUsers: AdminUser[];
  initialDefaultTrialEndsAt: string | null;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [defaultDraft, setDefaultDraft] = useState(toLocalInput(initialDefaultTrialEndsAt));
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialUsers.map((u) => [u.id, toLocalInput(u.trialEndsAt)]))
  );
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const setBusyOn = (key: string, on: boolean) =>
    setBusy((b) => {
      const next = new Set(b);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  async function saveDefault() {
    setError(null);
    setBusyOn("default", true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ defaultTrialEndsAt: defaultDraft ? new Date(defaultDraft).toISOString() : null }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "save failed");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyOn("default", false);
    }
  }

  async function clearDefault() {
    setDefaultDraft("");
    setError(null);
    setBusyOn("default", true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ defaultTrialEndsAt: null }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "save failed");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyOn("default", false);
    }
  }

  async function saveUserTrial(id: string, valueOverride?: string) {
    setError(null);
    setBusyOn(id, true);
    try {
      const draft = valueOverride !== undefined ? valueOverride : drafts[id];
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trialEndsAt: draft ? new Date(draft).toISOString() : null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "save failed");
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, trialEndsAt: data.user.trialEndsAt } : u)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyOn(id, false);
    }
  }

  async function setSubscriptionStatus(id: string, status: string) {
    setError(null);
    setBusyOn(id, true);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscriptionStatus: status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "save failed");
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, subscriptionStatus: data.user.subscriptionStatus } : u)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyOn(id, false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-200">Default dry-run cutoff</h2>
        <p className="mb-4 text-xs text-zinc-500">
          Applied to every user without a personal override below. Empty = no cutoff, nobody&apos;s blocked.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="datetime-local"
            className={inputCls}
            value={defaultDraft}
            onChange={(e) => setDefaultDraft(e.target.value)}
          />
          <button className={btnCls} disabled={busy.has("default")} onClick={saveDefault}>
            Save
          </button>
          <button className={btnCls} disabled={busy.has("default")} onClick={clearDefault}>
            Clear
          </button>
        </div>
      </section>

      <section className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[820px] border-collapse text-left text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2.5">Email</th>
              <th className="px-3 py-2.5">Subscription</th>
              <th className="px-3 py-2.5">Trial override</th>
              <th className="px-3 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-zinc-500">
                  No users yet.
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className="bg-zinc-950">
                <td className="px-3 py-2.5 text-zinc-200">{u.email}</td>
                <td className="px-3 py-2.5">
                  <select
                    className={inputCls}
                    value={u.subscriptionStatus}
                    onChange={(e) => setSubscriptionStatus(u.id, e.target.value)}
                    disabled={busy.has(u.id)}
                  >
                    <option value="none">none</option>
                    <option value="active">active</option>
                    <option value="cancelled">cancelled</option>
                    <option value="halted">halted</option>
                    <option value="pending">pending</option>
                  </select>
                </td>
                <td className="px-3 py-2.5">
                  <input
                    type="datetime-local"
                    className={inputCls}
                    value={drafts[u.id] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [u.id]: e.target.value }))}
                  />
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex gap-1.5">
                    <button className={btnCls} disabled={busy.has(u.id)} onClick={() => saveUserTrial(u.id)}>
                      Save
                    </button>
                    <button
                      className={btnCls}
                      disabled={busy.has(u.id)}
                      onClick={() => {
                        setDrafts((d) => ({ ...d, [u.id]: "" }));
                        saveUserTrial(u.id, "");
                      }}
                    >
                      Clear
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
