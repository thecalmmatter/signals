import Link from "next/link";
import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-20">
      <div className="w-full max-w-md text-center">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-500/15 text-emerald-400 ring-1 ring-inset ring-emerald-400/30">
            <svg viewBox="0 0 16 16" className="h-4 w-4 fill-current" aria-hidden="true">
              <path d="M2 12l3.5-3.5 2.5 2.5L13 5l2 2v6H2z" />
            </svg>
          </span>
          Signals
        </Link>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-zinc-50">
          Create your account
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Email or Google. Free plan to start.
        </p>
        <div className="mt-8">
          <SignUp
            fallbackRedirectUrl="/dashboard"
            appearance={{
              variables: { colorPrimary: "#10b981", colorBackground: "#09090b", colorNeutral: "#fafafa", colorInput: "#18181b", colorInputForeground: "#fafafa" },
              elements: { card: "shadow-none border border-zinc-800" },
            }}
          />
        </div>
        <p className="mt-6 text-sm text-zinc-500">
          Already have an account?{" "}
          <Link href="/login" className="text-emerald-400 hover:text-emerald-300">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
