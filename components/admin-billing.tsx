"use client";

import { useEffect, useRef, useState } from "react";

type AdminUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  isAdmin: boolean;
  subscriptionStatus: string;
  trialEndsAt: string | null;
  razorpaySubscriptionId: string | null;
  createdAt: string;
};

function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

const inputCls =
  "rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 outline-none transition focus:border-zinc-600";

const btnCls =
  "rounded-md px-2.5 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 border border-zinc-700 text-zinc-300 hover:bg-zinc-800";

const dateFmt = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

// <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm"; DB gives back an
// ISO string with seconds/offset — trim to what the input accepts.
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function displayName(u: AdminUser): string {
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return name || u.email;
}

function initials(u: AdminUser): string {
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || u.email[0]?.toUpperCase() || "?";
  }
  return u.email[0]?.toUpperCase() ?? "?";
}

type AccessBadge = { label: string; cls: string };

// Mirrors lib/access.ts's getAccessStatus() logic for display purposes only
// (no server round-trip) — same precedence: admin > billing disabled >
// active subscription > cancelled/halted/pending > trial window > expired.
function accessBadge(u: AdminUser, defaultTrialEndsAt: string | null, billingEnabled: boolean): AccessBadge {
  if (u.isAdmin) return { label: "Admin", cls: "bg-violet-400/15 text-violet-300 ring-violet-400/40" };
  if (!billingEnabled) return { label: "Free (billing off)", cls: "bg-zinc-400/15 text-zinc-300 ring-zinc-400/40" };
  if (u.subscriptionStatus === "active") return { label: "Active", cls: "bg-emerald-400/15 text-emerald-300 ring-emerald-400/40" };
  if (u.subscriptionStatus === "cancelled") return { label: "Cancelled", cls: "bg-rose-400/15 text-rose-300 ring-rose-400/40" };
  if (u.subscriptionStatus === "halted") return { label: "Halted", cls: "bg-amber-400/15 text-amber-300 ring-amber-400/40" };
  if (u.subscriptionStatus === "pending") return { label: "Pending", cls: "bg-amber-400/15 text-amber-300 ring-amber-400/40" };

  const effective = u.trialEndsAt ?? defaultTrialEndsAt;
  if (!effective) return { label: "Trial (no cutoff)", cls: "bg-sky-400/15 text-sky-300 ring-sky-400/40" };
  const msLeft = new Date(effective).getTime() - Date.now();
  if (msLeft <= 0) return { label: "Expired", cls: "bg-rose-400/15 text-rose-300 ring-rose-400/40" };
  const daysLeft = Math.ceil(msLeft / 86_400_000);
  return { label: `Trial · ${daysLeft}d left`, cls: "bg-sky-400/15 text-sky-300 ring-sky-400/40" };
}

function Badge({ label, cls }: AccessBadge) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", cls)}>
      {label}
    </span>
  );
}

function RowMenu({
  user,
  busy,
  onSetStatus,
  onDelete,
}: {
  user: AdminUser;
  busy: boolean;
  onSetStatus: (status: string) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const itemCls =
    "block w-full px-3 py-2 text-left text-xs text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        aria-label={`Actions for ${user.email}`}
        className="rounded-md p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-40"
      >
        <svg viewBox="0 0 16 16" className="h-4 w-4 fill-current" aria-hidden="true">
          <circle cx="8" cy="3" r="1.4" />
          <circle cx="8" cy="8" r="1.4" />
          <circle cx="8" cy="13" r="1.4" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-20 w-44 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 shadow-xl">
          {user.subscriptionStatus !== "cancelled" && (
            <button
              type="button"
              className={itemCls}
              disabled={busy || user.isAdmin}
              onClick={() => {
                setOpen(false);
                onSetStatus("cancelled");
              }}
            >
              Cancel subscription
            </button>
          )}
          {user.subscriptionStatus !== "active" && (
            <button
              type="button"
              className={itemCls}
              disabled={busy || user.isAdmin}
              onClick={() => {
                setOpen(false);
                onSetStatus("active");
              }}
            >
              Mark active (comp)
            </button>
          )}
          <div className="border-t border-zinc-800" />
          <button
            type="button"
            className={cn(itemCls, "text-rose-400 hover:bg-rose-500/10")}
            disabled={busy || user.isAdmin}
            title={user.isAdmin ? "Can't delete an admin account from here" : undefined}
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            Delete user
          </button>
        </div>
      )}
    </div>
  );
}

export default function AdminBilling({
  initialUsers,
  initialDefaultTrialEndsAt,
  currentAdminId,
  billingEnabled,
}: {
  initialUsers: AdminUser[];
  initialDefaultTrialEndsAt: string | null;
  currentAdminId: string;
  billingEnabled: boolean;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [defaultDraft, setDefaultDraft] = useState(toLocalInput(initialDefaultTrialEndsAt));
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialUsers.map((u) => [u.id, toLocalInput(u.trialEndsAt)]))
  );
  const [editingTrial, setEditingTrial] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const setBusyOn = (key: string, on: boolean) =>
    setBusy((b) => {
      const next = new Set(b);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const filtered = users.filter((u) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return u.email.toLowerCase().includes(q) || displayName(u).toLowerCase().includes(q);
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
      setToast("Default cutoff updated");
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
      setToast("Default cutoff cleared");
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
      setEditingTrial(null);
      setToast("Trial override updated");
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
      setToast(data.razorpayWarning ?? `Subscription set to ${status}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyOn(id, false);
    }
  }

  async function deleteUser(id: string, email: string) {
    if (!window.confirm(`Delete ${email}? This revokes their dashboard access immediately and can't be undone.`)) return;
    setError(null);
    setBusyOn(id, true);
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "delete failed");
      setUsers((prev) => prev.filter((u) => u.id !== id));
      setSelected((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
      setToast(`${email} deleted`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyOn(id, false);
    }
  }

  const selectedUsers = users.filter((u) => selected.has(u.id) && !u.isAdmin);

  async function bulkCancel() {
    if (selectedUsers.length === 0) return;
    await Promise.all(selectedUsers.map((u) => setSubscriptionStatus(u.id, "cancelled")));
    setToast(`Cancelled ${selectedUsers.length} subscription${selectedUsers.length === 1 ? "" : "s"}`);
  }

  async function bulkDelete() {
    if (selectedUsers.length === 0) return;
    if (
      !window.confirm(
        `Delete ${selectedUsers.length} user${selectedUsers.length === 1 ? "" : "s"}? This revokes their dashboard access immediately and can't be undone.`
      )
    )
      return;
    for (const u of selectedUsers) {
      await deleteUser(u.id, u.email);
    }
  }

  const allVisibleSelectable = filtered.filter((u) => !u.isAdmin);
  const allVisibleSelected =
    allVisibleSelectable.length > 0 && allVisibleSelectable.every((u) => selected.has(u.id));

  return (
    <div className="flex flex-col gap-4">
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-400">
          <span className="font-semibold text-zinc-200">{users.length}</span> user{users.length === 1 ? "" : "s"}
        </p>
        <input
          type="text"
          placeholder="Search name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-xs rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 outline-none transition placeholder:text-zinc-600 focus:border-zinc-600"
        />
      </div>

      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-sky-800/50 bg-sky-500/10 px-4 py-2.5">
          <span className="text-sm text-sky-300">{selectedUsers.length} selected</span>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800"
              onClick={bulkCancel}
            >
              Cancel subscriptions
            </button>
            <button
              type="button"
              className="rounded-md border border-rose-700/60 bg-rose-500/10 px-2.5 py-1 text-xs font-medium text-rose-400 transition hover:bg-rose-500/20"
              onClick={bulkDelete}
            >
              Delete selected
            </button>
          </div>
        </div>
      )}

      <section className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[900px] border-collapse text-left text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  className="accent-sky-500"
                  checked={allVisibleSelected}
                  onChange={(e) => {
                    setSelected((s) => {
                      const next = new Set(s);
                      if (e.target.checked) allVisibleSelectable.forEach((u) => next.add(u.id));
                      else allVisibleSelectable.forEach((u) => next.delete(u.id));
                      return next;
                    });
                  }}
                />
              </th>
              <th className="px-3 py-2.5">User</th>
              <th className="px-3 py-2.5">Access</th>
              <th className="px-3 py-2.5">Trial override</th>
              <th className="px-3 py-2.5">Added</th>
              <th className="w-10 px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-zinc-500">
                  {users.length === 0 ? "No users yet." : "No users match your search."}
                </td>
              </tr>
            )}
            {filtered.map((u) => {
              const busyRow = busy.has(u.id);
              const badge = accessBadge(u, initialDefaultTrialEndsAt, billingEnabled);
              return (
                <tr key={u.id} className="bg-zinc-950">
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      className="accent-sky-500 disabled:opacity-30"
                      disabled={u.isAdmin}
                      checked={selected.has(u.id)}
                      onChange={(e) =>
                        setSelected((s) => {
                          const next = new Set(s);
                          if (e.target.checked) next.add(u.id);
                          else next.delete(u.id);
                          return next;
                        })
                      }
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-zinc-800 text-[11px] font-semibold text-zinc-300 ring-1 ring-inset ring-zinc-700">
                        {initials(u)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-100">
                          {displayName(u)}
                          {u.id === currentAdminId && <span className="ml-1.5 text-xs text-zinc-500">(you)</span>}
                        </p>
                        <p className="truncate text-xs text-zinc-500">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge {...badge} />
                  </td>
                  <td className="px-3 py-2.5">
                    {editingTrial === u.id ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="datetime-local"
                          className={inputCls}
                          value={drafts[u.id] ?? ""}
                          onChange={(e) => setDrafts((d) => ({ ...d, [u.id]: e.target.value }))}
                        />
                        <button className={btnCls} disabled={busyRow} onClick={() => saveUserTrial(u.id)}>
                          Save
                        </button>
                        <button
                          className={btnCls}
                          disabled={busyRow}
                          onClick={() => {
                            setDrafts((d) => ({ ...d, [u.id]: "" }));
                            saveUserTrial(u.id, "");
                          }}
                        >
                          Clear
                        </button>
                        <button className={btnCls} disabled={busyRow} onClick={() => setEditingTrial(null)}>
                          Done
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="text-xs text-zinc-400 underline decoration-dotted underline-offset-2 transition hover:text-zinc-200"
                        onClick={() => setEditingTrial(u.id)}
                      >
                        {u.trialEndsAt ? dateFmt(u.trialEndsAt) : "no override — edit"}
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-zinc-400">{dateFmt(u.createdAt)}</td>
                  <td className="px-3 py-2.5">
                    <RowMenu
                      user={u}
                      busy={busyRow}
                      onSetStatus={(status) => setSubscriptionStatus(u.id, status)}
                      onDelete={() => deleteUser(u.id, u.email)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-200 shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  );
}
