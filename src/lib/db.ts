import "server-only";
import { Pool } from "pg";

const globalForDb = globalThis as unknown as {
  attendancePool?: Pool;
};

function createPool() {
  const required = [
    "PGHOST",
    "PGPORT",
    "PGDATABASE",
    "PGUSER",
    "PGPASSWORD",
  ] as const;

  for (const name of required) {
    if (!process.env[name]) {
      throw new Error(`Missing environment variable: ${name}`);
    }
  }

  const pool = new Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });

  pool.on("error", () => {
    console.error("An idle database connection failed.");
  });

  return pool;
}

export function getDb(): Pool {
  globalForDb.attendancePool ??= createPool();
  return globalForDb.attendancePool;
}