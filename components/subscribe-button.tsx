"use client";

import { useState } from "react";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadCheckoutScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("failed to load Razorpay checkout"));
    document.body.appendChild(script);
  });
}

export function SubscribeButton({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      await loadCheckoutScript();

      const res = await fetch("/api/billing/subscribe", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? data.error ?? "failed to start subscription");

      if (data.status === "active") {
        window.location.reload();
        return;
      }

      const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
      if (!keyId) throw new Error("NEXT_PUBLIC_RAZORPAY_KEY_ID not configured");

      const rzp = new window.Razorpay!({
        key: keyId,
        subscription_id: data.subscriptionId,
        name: "Signals",
        description: "Pro plan — full signal access",
        prefill: data.email ? { email: data.email } : undefined,
        theme: { color: "#34d399" },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_subscription_id: string;
          razorpay_signature: string;
        }) => {
          try {
            const confirmRes = await fetch("/api/billing/confirm", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                paymentId: response.razorpay_payment_id,
                subscriptionId: response.razorpay_subscription_id,
                signature: response.razorpay_signature,
              }),
            });
            if (!confirmRes.ok) throw new Error("could not confirm payment");
            window.location.reload();
          } catch (err) {
            setError(err instanceof Error ? err.message : "could not confirm payment");
          }
        },
        modal: {
          ondismiss: () => setBusy(false),
        },
      });
      rzp.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to start subscription");
      setBusy(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className={
          className ??
          "inline-flex h-11 items-center justify-center rounded-full bg-emerald-500 px-6 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
        }
      >
        {busy ? "Opening checkout…" : "Subscribe now"}
      </button>
      {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
    </div>
  );
}
