import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { Ticker } from "@/components/ticker";
import { Paywall } from "@/components/paywall";
import { STOCKS } from "@/lib/stocks";
import { getAccessStatus } from "@/lib/access";
import { ensureUserRecord } from "@/lib/users";

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/login");

  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    "your account";

  if (user) {
    await ensureUserRecord({
      id: userId,
      email,
      firstName: user.firstName,
      lastName: user.lastName,
    });
  }

  const access = await getAccessStatus(userId);

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
            <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-0.5 text-[11px] font-medium text-zinc-300">
              {access.reason === "disabled"
                ? "Free (beta)"
                : access.reason === "trial"
                  ? "Dry run"
                  : access.reason === "admin"
                    ? "Admin"
                    : access.subscriptionStatus}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-zinc-400 sm:block">{email}</span>
            <UserButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12 md:py-16">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50 md:text-3xl">
            Your live signal feed
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Refreshed automatically every 10 seconds from the signals database.
          </p>
        </div>

        {access.allowed ? (
          <Ticker fallback={STOCKS} live />
        ) : (
          <Paywall trialEndsAt={access.trialEndsAt} />
        )}
      </main>
    </div>
  );
}