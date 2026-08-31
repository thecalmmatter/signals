"use client";

// A near-invisible link — the ONLY way into /dashboard/stocks/[symbol]. No
// button chrome, no icon, just the symbol text itself with a subtle hover
// cue. Left-clicking it (no modifier) animates into the destination page
// via the native View Transitions API: this element and the destination's
// <h1> share a view-transition-name (see stock-analytics-pane.tsx), so
// supporting browsers morph the symbol text directly into the page title
// instead of a hard cut. Unsupported browsers (no document.startViewTransition
// — Safari/Firefox at time of writing) just get an instant navigation, same
// as before — this is pure progressive enhancement, not a requirement.
//
// Still a real <Link> under the hood (real href, real prefetch) so
// middle-click / cmd-click / right-click-open-in-new-tab all keep working —
// the click handler only intercepts a plain left click.

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties, MouseEvent, ReactNode } from "react";

export function stockViewTransitionName(symbol: string): string {
  return `stock-symbol-${symbol.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

function startViewTransition(update: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (typeof doc.startViewTransition === "function") {
    doc.startViewTransition(update);
  } else {
    update();
  }
}

export function SymbolLink({
  symbol,
  className,
  children,
}: {
  symbol: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const href = `/dashboard/stocks/${symbol}`;

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return; // modifier/middle click — let the browser do its normal thing
    }
    e.preventDefault();
    startViewTransition(() => router.push(href));
  };

  return (
    <Link
      href={href}
      onClick={handleClick}
      className={className}
      style={{ viewTransitionName: stockViewTransitionName(symbol) } as CSSProperties}
    >
      {children}
    </Link>
  );
}
