import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { PoolClient } from "pg";
import { from as copyFrom } from "pg-copy-streams";

// Bulk-loads rows with a real `COPY ... FROM STDIN` (T-009, RISK_ENGINE §9), not parameterized
// INSERTs — the difference matters at `--scale 1000`'s ~540k observation rows. node-postgres has no
// built-in COPY support (DECISIONS 2026-10-17), hence `pg-copy-streams`.

function csvField(value: string | number | boolean | null): string {
  if (value === null) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** `client` must be a checked-out `PoolClient`, not the `Pool` itself — COPY holds the connection in
 * a special mode for the duration of the stream. Caller releases the client. */
export async function copyInsert(
  client: PoolClient,
  table: string,
  columns: readonly string[],
  rows: readonly (string | number | boolean | null)[][],
): Promise<void> {
  if (rows.length === 0) return;
  const stream = client.query(copyFrom(`COPY ${table} (${columns.join(", ")}) FROM STDIN WITH (FORMAT csv)`));
  const csv = rows.map((row) => row.map(csvField).join(",")).join("\n") + "\n";
  await pipeline(Readable.from([csv]), stream);
}
