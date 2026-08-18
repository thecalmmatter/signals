"use client";

import { useState } from "react";

export function WaitlistForm({ source }: { source: string | null }) {
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState(""); // honeypot — real users never touch this
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    setError(null);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source, company }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "something went wrong");
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "something went wrong");
    }
  };

  if (status === "done") {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-6 py-5 text-center">
        <svg viewBox="0 0 16 16" className="h-6 w-6 fill-emerald-400" aria-hidden="true">
          <path d="M6.5 11.2L2.8 7.5 1.4 8.9l5.1 5.1 8.1-8.1-1.4-1.4L6.5 11.2z" />
        </svg>
        <p className="text-sm font-medium text-zinc-100">You&apos;re on the list.</p>
        <p className="text-xs text-zinc-400">
          We&apos;ll reach out with tomorrow&apos;s signal — keep an eye on your inbox.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-md">
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <label className="sr-only" htmlFor="waitlist-email">
          Email address
        </label>
        <input
          id="waitlist-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          disabled={status === "sending"}
          className="h-12 flex-1 rounded-full border border-zinc-700 bg-zinc-900 px-5 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition focus:border-emerald-400/60 disabled:opacity-60"
        />
        {/* Honeypot — visually hidden, skipped by screen readers, but present
            in the DOM/tab order for naive bots that fill every field. */}
        <input
          type="text"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute h-0 w-0 opacity-0"
          style={{ pointerEvents: "none" }}
        />
        <button
          type="submit"
          disabled={status === "sending"}
          className="inline-flex h-12 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-6 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "sending" ? "Joining…" : "Get tomorrow's signal"}
        </button>
      </div>
      {error && <p className="mt-2 text-center text-xs text-rose-400">{error}</p>}
      <p className="mt-3 text-center text-xs text-zinc-500">
        Free. One email a day. Unsubscribe anytime.
      </p>
    </form>
  );
}
