// npm run db:redirect -- --from <old id> --to <new id> --reason "<why>"
//                        [--apply] [--yes-production]
//
// The reviewed step for a renamed street (docs/database.md): TERYT gives a
// renamed street a new SYM_UL, so its page id SIMC-SYM_UL changes, and the
// TERYT check (scripts/check-teryt.ts) opens an issue. A person who has
// reviewed it runs this to keep the old address working: /adres/<old>/…
// then answers 308 to the same path on the new id. Never run by an import
// or a workflow. Without --apply it only checks and prints.
//
// Checks: the new id is a place (a street or a locality); the old id is not
// one any more (the import has replaced it); the old id has no redirect yet
// and is no redirect's target (no chains).
//
// Env: IMPORT_DATABASE_URL, DATABASE_URL_UNPOOLED or DATABASE_URL; optional
// REVALIDATE_SECRET (then the site's cache is purged, as after an import;
// site: etl/sources.yaml site.url, or SITE_URL), VERCEL_AUTOMATION_BYPASS_SECRET.
import { parseArgs } from "node:util";
import pg from "pg";
import { describeTarget } from "./lib/import-data.ts";
import { databaseUrl } from "./lib/local-db.ts";
import { revalidate } from "./lib/revalidate.ts";

const { values: args } = parseArgs({
  options: {
    from: { type: "string" },
    to: { type: "string" },
    reason: { type: "string" },
    apply: { type: "boolean", default: false },
    "yes-production": { type: "boolean", default: false },
  },
});

function fail(message: string): never {
  console.error(`\n${message}`);
  process.exit(1);
}

const { from, to, reason } = args;
if (!from || !to || !reason)
  fail(
    'Usage: npm run db:redirect -- --from <old id> --to <new id> --reason "<why>" [--apply]',
  );
const url = databaseUrl();
if (!url) fail("DATABASE_URL_UNPOOLED or DATABASE_URL is not set.");
const target = describeTarget(url, process.env);
console.log(
  `Target: ${target.label}${target.production ? ", PRODUCTION" : ""}. Mode: ${args.apply ? "APPLY" : "dry run"}.`,
);
if (args.apply && target.production && !args["yes-production"])
  fail("This is the production database. Add --yes-production to write.");

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const place = async (id: string) =>
    (
      await client.query(
        "select id from streets where id = $1 union select id from localities where id = $1",
        [id],
      )
    ).rowCount;
  const problems: string[] = [];
  if (!(await place(to))) problems.push(`${to} is not a place.`);
  if (await place(from))
    problems.push(`${from} is still a place: import the rename first.`);
  const existing = await client.query(
    "select old_id, new_id from place_redirects where old_id = $1 or new_id = $1 or old_id = $2",
    [from, to],
  );
  for (const row of existing.rows)
    problems.push(`A redirect exists: ${row.old_id} → ${row.new_id}.`);
  if (problems.length > 0) fail(problems.join("\n"));

  console.log(`ok: /adres/${from} → /adres/${to} (${reason})`);
  if (!args.apply) {
    console.log("Dry run: nothing written. Add --apply to write.");
  } else {
    await client.query(
      "insert into place_redirects (old_id, new_id, reason) values ($1, $2, $3)",
      [from, to, reason],
    );
    console.log("Written.");
    await revalidate();
  }
} finally {
  await client.end();
}
