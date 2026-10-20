// npm run import:revert -- <batch id> [--dry-run]
//
// Undoes one batch of the unattended schedule import (docs/import-schedules.md)
// in one transaction: inserted events are deleted, changed ones restored,
// deleted ones put back. The undo is logged as batch "revert-<batch id>" and
// as an import_runs row, so a batch is reverted at most once. Refuses if an
// event was changed again since the batch (revert the later batch first).
//
// Env: IMPORT_DATABASE_URL (or DATABASE_URL_UNPOOLED / DATABASE_URL);
// optional REVALIDATE_SECRET to refresh the site (etl/sources.yaml site.url).
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import pg from "pg";
import { loadConfig } from "../config.ts";
import { EVENT_FIELDS, type Op, writeChange } from "./events-db.ts";
import { diffEvents, type EventRow } from "./lib.ts";

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: { "dry-run": { type: "boolean", default: false } },
});
const batchId = positionals[0];
if (!batchId || positionals.length !== 1) {
  console.error("Usage: npm run import:revert -- <batch id> [--dry-run]");
  process.exit(2);
}
const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const url =
  process.env.IMPORT_DATABASE_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL;
if (!url) fail("IMPORT_DATABASE_URL is not set.");
const db = new pg.Client({ connectionString: url });
await db.connect();

const undoId = `revert-${batchId}`;
const { rows: changes } = await db.query(
  "select event_id, op, before, after from import_changes where batch_id = $1 order by id desc",
  [batchId],
);
if (changes.length === 0) fail(`No changes logged for batch ${batchId}.`);
const done = await db.query(
  "select 1 from import_changes where batch_id = $1 limit 1",
  [undoId],
);
if (done.rowCount) fail(`Batch ${batchId} is already reverted (${undoId}).`);

const startedAt = new Date().toISOString();
await db.query("begin");
try {
  for (const change of changes) {
    const current = (
      await db.query(
        `select ${EVENT_FIELDS.map(([, c]) => `"${c}"`).join(", ")},
           to_char(checked_at, 'YYYY-MM-DD') as checked_at,
           to_char(shifted_from, 'YYYY-MM-DD') as shifted_from
         from events where id = $1`,
        [change.event_id],
      )
    ).rows[0];
    const now = current
      ? (Object.fromEntries(
          EVENT_FIELDS.map(([k, c]) => [k, current[c] ?? null]),
        ) as EventRow)
      : null;
    // The event must still be as the batch left it.
    const expected = change.after as EventRow | null;
    const same =
      expected && now
        ? diffEvents([now], [expected]).changed.length === 0
        : expected === now;
    if (!same)
      throw new Error(
        `${change.event_id} changed after batch ${batchId}; revert the later batch first.`,
      );
    const undo: Record<Op, Op> = {
      insert: "delete",
      update: "update",
      delete: "insert",
    };
    await writeChange(
      db,
      undoId,
      undo[change.op as Op],
      now,
      change.before as EventRow | null,
    );
  }
  if (args["dry-run"]) {
    await db.query("rollback");
    console.log(`Dry run: ${changes.length} changes would be undone.`);
    await db.end();
    process.exit(0);
  }
  await db.query(
    `insert into import_runs (id, started_at, finished_at, source, status, events_added,
       events_removed, events_changed, batch_id, actions_run_url)
     values ($1, $2, $3, 'revert', 'applied', $4, $5, $6, $7, $8)`,
    [
      randomUUID(),
      startedAt,
      new Date().toISOString(),
      changes.filter((c) => c.op === "delete").length,
      changes.filter((c) => c.op === "insert").length,
      changes.filter((c) => c.op === "update").length,
      undoId,
      process.env.ACTIONS_RUN_URL ?? null,
    ],
  );
  await db.query("commit");
} catch (error) {
  await db.query("rollback");
  fail(`Revert FAILED, nothing changed: ${(error as Error).message}`);
}
await db.end();
console.log(
  `Reverted batch ${batchId}: ${changes.length} changes (${undoId}).`,
);

const site = loadConfig().site.url;
const secret = process.env.REVALIDATE_SECRET;
if (secret) {
  const response = await fetch(new URL("/api/revalidate", site), {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });
  console.log(`Revalidate: HTTP ${response.status}`);
} else {
  console.log("Revalidate skipped: cached pages refresh within an hour.");
}
