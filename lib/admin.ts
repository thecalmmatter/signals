import { auth } from "@clerk/nextjs/server";

const ADMIN_IDS = new Set(
  (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

/**
 * Returns the current signed-in user's Clerk id IF they are on the admin list,
 * otherwise null. Call this at the top of the admin page and every admin API
 * route; null means "not allowed" (redirect the page, 403 the API).
 */
export async function getAdminUserId(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return null;
  return ADMIN_IDS.has(userId) ? userId : null;
}
