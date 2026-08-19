import { redirect } from "next/navigation";
import { getAdminUserId } from "@/lib/admin";
import AdminBroker from "@/components/admin-broker";

export const dynamic = "force-dynamic";

export default async function AdminBrokerPage() {
  const adminId = await getAdminUserId();
  if (!adminId) redirect("/dashboard");

  return (
    <div className="flex flex-1 flex-col bg-zinc-950 text-zinc-100">
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10 md:py-14">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-50 md:text-3xl">
              Broker — Fyers
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">
              Place orders and see running positions on your connected Fyers
              account. Admin-only, one shared account — this is you trading,
              not a per-user brokerage feature.
            </p>
          </div>
          <a
            href="/dashboard/admin"
            className="shrink-0 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800"
          >
            ← Back to admin
          </a>
        </div>
        <AdminBroker />
      </main>
    </div>
  );
}
