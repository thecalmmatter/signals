import { Pool } from "pg";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://signals_app:signals_app@localhost:5432/signals_app";

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString });
  }
  return pool;
}
