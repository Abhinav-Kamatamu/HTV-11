import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getDb, getPool } from "./client";
import {
  aggregateStatements,
  extensionStatements,
  hypertableStatements,
  refreshStatements,
} from "./timescale";

// Run with `npm run db:migrate`. Order matters: extensions, plain tables (drizzle),
// hypertable conversion, then continuous aggregates.
async function main() {
  const pool = getPool();
  const run = async (statements: string[]) => {
    for (const sql of statements) await pool.query(sql);
  };

  await run(extensionStatements);
  await migrate(getDb(), { migrationsFolder: path.join(__dirname, "migrations") });
  await run(hypertableStatements);
  await run(aggregateStatements);
  await run(refreshStatements);
  await pool.end();
  console.log("db:migrate done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
