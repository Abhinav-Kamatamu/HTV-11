import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (copy .env.example to .env.local)");
  return url;
}

// Reuse one pool across Next.js dev hot reloads.
const globalForPool = globalThis as unknown as { __undertowPool?: Pool };

export function getPool(): Pool {
  globalForPool.__undertowPool ??= new Pool({ connectionString: databaseUrl() });
  return globalForPool.__undertowPool;
}

export function getDb() {
  return drizzle(getPool(), { schema });
}
