import { defineConfig } from "drizzle-kit";

// Only plain tables go through drizzle-kit. Timescale objects (hypertable, continuous
// aggregates) are applied by src/db/migrate.ts from src/db/timescale.ts.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
