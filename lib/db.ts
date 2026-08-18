import { Pool } from "pg";

// Use Neon's POOLED connection string here (hostname has "-pooler" in it) —
// not the direct one. On serverless (Vercel), each function instance can end
// up creating its own Pool; pointed at a direct connection, that exhausts
// Neon's max_connections fast under real concurrent traffic. The pooled
// endpoint fans out through PgBouncer instead. See README "Database" section.
const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://signals_app:signals_app@localhost:5432/signals_app";

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString,
      // Keep each instance's own pool small — we're relying on Neon's
      // PgBouncer (via the pooled connection string) to fan out across many
      // serverless instances, not on this Pool being the only thing limiting
      // connection count.
      max: 5,
      idleTimeoutMillis: 30_000,
    });
  }
  return pool;
}
