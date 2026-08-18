// Ensures a `users` row exists for the signed-in Clerk user. Normally the
// Clerk webhook (app/api/webhooks/clerk/route.ts) does this on user.created,
// but that webhook needs a public URL — it can't reach localhost in dev. This
// is a lazy fallback so local/dev signups still show up in the admin panel.
// Never overwrites subscription_status/trial_ends_at, which are admin/webhook
// owned.

import { getPool } from "@/lib/db";

export async function ensureUserRecord(params: {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}): Promise<void> {
  const { id, email, firstName = null, lastName = null } = params;
  if (!id || !email) return;

  try {
    await getPool().query(
      `INSERT INTO users (id, email, first_name, last_name, subscription_status)
       VALUES ($1, $2, $3, $4, 'none')
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         updated_at = now()`,
      [id, email, firstName, lastName]
    );
  } catch (error) {
    // Fail open — don't break the dashboard if this write hiccups (e.g.
    // migration not applied yet). Same posture as lib/access.ts.
    console.error("ensureUserRecord failed — is scripts/schema_users.sql applied?", error);
  }
}
