import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getPool } from "@/lib/db";
import {
  POSITION_COLUMNS,
  mapPositionRow,
  loadLivePricesFor,
  returnPct,
  daysHeld,
  STATUS_STYLE,
  STATUS_LABEL,
  type AdminPosition,
} from "@/lib/positions-admin";

export const dynamic = "force-dynamic";

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 1 })}`;

// Every position ever logged, wins and losses both — no filtering by
// outcome. Same table any signed-in app user sees, not a curated subset.
// Table itself may not exist yet on a fresh env (migration not run) —
// degrade to an empty list instead of a hard 500, matching the admin page's
// pattern for the same table.
async function loadPositions(): Promise<AdminPosition[]> {
  try {
    const { rows } = await getPool().query(
      `SELECT ${POSITION_COLUMNS} FROM positions ORDER BY opened_at DESC NULLS LAST, id DESC LIMIT 500`
    );
    return rows.map(mapPositionRow);
  } catch (error) {
    console.error("failed to load positions for track record page (run scripts/migration_positions.sql?)", error);
    return [];
  }
}

export default async function TrackRecordPage() {
  const { userId } = await auth();
  if (!userId) redirect("/login");

  const positions = await loadPositions();
  const livePrices = await loadLivePricesFor(positions);

  const closed = positions.filter((p) => p.status !== "open");
  const wins = positions.filter((p) => p.status === "hit_target").length;
  const losses = positions.filter((p) => p.status === "hit_stop").length;
  const winRate = closed.length > 0 ? (wins / closed.length) * 100 : null;
  const returns = positions
    .map((p) => returnPct(p, livePrices[p.symbol]))
    .filter((v): v is number => v !== null);
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : null;

  return (
    <div className="flex flex-1 flex-col bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-40 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-500/15 text-emerald-400 ring-1 ring-inset ring-emerald-400/30">
              <svg viewBox="0 0 16 16" className="h-4 w-4 fill-current" aria-hidden="true">
                <path d="M2 12l3.5-3.5 2.5 2.5L13 5l2 2v6H2z" />
              </svg>
            </span>
            <span className="text-sm font-semibold tracking-tight">Signals</span>
          </div>
          <Link
            href="/dashboard"
            className="text-sm text-zinc-400 transition-colors hover:text-zinc-100"
          >
            ← Signal feed
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12 md:py-16">
        <div className="mb-8">
          <p className="font-mono text-xs uppercase tracking-widest text-sky-400">Track record</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50 md:text-3xl">
            Every position, wins and losses both.
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            This is still early and not every signal performs as expected — that&rsquo;s the point of
            showing this unfiltered. Every position below was logged the moment it was made
            (symbol, direction, entry, target, stop), and nothing is removed or reworded once
            it&rsquo;s live. Open positions compare entry price to the current live quote; closed
            ones use the logged exit price.
          </p>
        </div>

        <div className="mb-6 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-zinc-300">
            {positions.length} logged
          </span>
          <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-sky-400">
            {positions.length - closed.length} open
          </span>
          <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-emerald-400">
            {wins} hit target
          </span>
          <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-red-400">
            {losses} hit stop
          </span>
          {winRate !== null && (
            <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-zinc-300">
              {winRate.toFixed(0)}% win rate (closed only)
            </span>
          )}
          {avgReturn !== null && (
            <span
              className={`rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 ${
                avgReturn >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
              title="Open positions use live price, closed use logged exit price."
            >
              {avgReturn >= 0 ? "+" : ""}
              {avgReturn.toFixed(1)}% avg return ({returns.length} of {positions.length})
            </span>
          )}
        </div>

        <section className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full min-w-[880px] border-collapse text-left text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2.5">Symbol</th>
                <th className="px-3 py-2.5">Dir</th>
                <th className="px-3 py-2.5">Posted</th>
                <th className="px-3 py-2.5">Entry</th>
                <th className="px-3 py-2.5">Target</th>
                <th className="px-3 py-2.5">Stop</th>
                <th className="px-3 py-2.5">Return</th>
                <th className="px-3 py-2.5">Days</th>
                <th className="px-3 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {positions.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-zinc-500">
                    No positions logged yet.
                  </td>
                </tr>
              )}
              {positions.map((p) => {
                const ret = returnPct(p, livePrices[p.symbol]);
                const days = daysHeld(p.openedAt, p.closedAt);
                return (
                  <tr key={p.id} className={`bg-zinc-950 ${p.status !== "open" ? "opacity-90" : ""}`}>
                    <td className="px-3 py-2.5 font-medium text-zinc-100">{p.symbol}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                          p.direction === "buy"
                            ? "bg-emerald-500/15 text-emerald-400 ring-emerald-400/30"
                            : "bg-red-500/15 text-red-400 ring-red-400/30"
                        }`}
                      >
                        {p.direction}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-zinc-400">{p.openedAt ?? "—"}</td>
                    <td className="px-3 py-2.5 tabular-nums text-zinc-300">{inr(p.entryPrice)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-zinc-300">{inr(p.targetPrice)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-zinc-300">{inr(p.stopPrice)}</td>
                    <td
                      className={`px-3 py-2.5 font-medium tabular-nums ${
                        ret === null ? "text-zinc-600" : ret >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {ret === null ? "—" : `${ret >= 0 ? "+" : ""}${ret.toFixed(1)}%`}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-zinc-400">{days === null ? "—" : days}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${STATUS_STYLE[p.status]}`}
                      >
                        {STATUS_LABEL[p.status]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
