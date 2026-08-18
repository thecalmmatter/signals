import { clerkMiddleware } from "@clerk/nextjs/server";

// Next.js 16 network-boundary file (renamed from middleware). Clerk handles the
// session; we opt routes into protection with auth.protect().
export default clerkMiddleware(async (auth, req) => {
  const { pathname } = req.nextUrl;

  const isProtected =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/api/signals") ||
    pathname.startsWith("/api/stocks") ||
    pathname.startsWith("/api/billing") ||
    pathname.startsWith("/api/admin");

  if (isProtected) {
    await auth.protect(); // redirects to /login when unauthenticated
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
    // Always run for Clerk-specific frontend API routes
    "/__clerk/(.*)",
  ],
};