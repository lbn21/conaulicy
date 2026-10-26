// npm run db:districts [-- --apply [--yes-production] | --expect-no-changes]
//
// Writes the gazetteer (lib/districts-seed.ts) to district_aliases and
// district_alias_streets, replacing what is there, in one transaction.
// Checks every street id against the TERYT snapshot first and stops on any
// it lacks. Without --apply it only checks and prints what would change;
// --expect-no-changes also exits 1 unless there is nothing to change. Any
// database but a local one only inside GitHub Actions: production through
// the prod-db workflow (task migrate-districts), which Jakub approves and
// which backs up first (scripts/lib/districts-target.ts).
//
// Env: IMPORT_DATABASE_URL, DATABASE_URL_UNPOOLED or DATABASE_URL.
import { parseArgs } from "node:util";
import pg from "pg";
import { checkDistricts } from "../lib/districts.ts";
import { DISTRICTS } from "../lib/districts-seed.ts";
import { ZUK_PLACES } from "../lib/zuk-places.generated.ts";
import { districtsTargetRefusal } from "./lib/districts-target.ts";
import { fail, guardTarget } from "./lib/import-data.ts";
import { databaseUrl } from "./lib/local-db.ts";

const { values: args } = parseArgs({
  options: {
    apply: { type: "boolean", default: false },
    "yes-production": { type: "boolean", default: false },
    "expect-no-changes": { type: "boolean", default: false },
  },
});
if (args.apply && args["expect-no-changes"])
  fail("--expect-no-changes is a check: it never writes. Drop --apply.");

try {
  checkDistricts(DISTRICTS, ZUK_PLACES.streets);
} catch (error) {
  fail(`The gazetteer has ids TERYT lacks:\n${(error as Error).message}`);
}
const url = databaseUrl();
if (!url) fail("DATABASE_URL_UNPOOLED or DATABASE_URL is not set.");
const refusal = districtsTargetRefusal(url, args, process.env);
if (refusal) fail(refusal);
guardTarget(url, args);

/** One line per row, to compare what is stored with the seed. */
const rows = (
  aliases: Array<Record<string, unknown>>,
  streets: Array<Record<string, unknown>>,
) =>
  new Set([
    ...aliases.map((a) => `alias ${JSON.stringify(a)}`),
    ...streets.map((s) => `street ${JSON.stringify(s)}`),
  ]);

const seed = rows(
  DISTRICTS.map((d) => ({
    id: d.id,
    locality_id: d.localityId,
    teryt_simc: d.simc,
    name: d.name,
    variants: d.variants,
    confidence: d.confidence,
    source_url: d.sourceUrl,
  })),
  DISTRICTS.flatMap((d) =>
    d.streets.map((s) => ({
      alias_id: d.id,
      street_id: s.id,
      confidence: s.confidence,
      part: s.part,
      source_url: s.sourceUrl,
    })),
  ),
);

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const aliases = await client.query(
    "select id, locality_id, teryt_simc, name, variants, confidence, source_url from district_aliases",
  );
  const streets = await client.query(
    "select alias_id, street_id, confidence, part, source_url from district_alias_streets",
  );
  const stored = rows(aliases.rows, streets.rows);
  const added = [...seed].filter((r) => !stored.has(r));
  const removed = [...stored].filter((r) => !seed.has(r));
  for (const r of removed) console.log(`- ${r}`);
  for (const r of added) console.log(`+ ${r}`);
  console.log(
    `${DISTRICTS.length} districts, ${DISTRICTS.reduce((n, d) => n + d.streets.length, 0)} street links; ${added.length} rows to add, ${removed.length} to remove.`,
  );
  if (args["expect-no-changes"]) {
    if (added.length > 0 || removed.length > 0) {
      console.error("Expected no changes: the database differs from the seed.");
      process.exitCode = 1;
    } else console.log("No changes, as expected.");
  } else if (!args.apply) {
    console.log("Dry run: nothing written. Add --apply to write.");
  } else if (added.length === 0 && removed.length === 0) {
    console.log("Nothing to change.");
  } else {
    await client.query("begin");
    await client.query("delete from district_aliases");
    for (const d of DISTRICTS) {
      await client.query(
        "insert into district_aliases (id, locality_id, teryt_simc, name, variants, confidence, source_url) values ($1, $2, $3, $4, $5, $6, $7)",
        [
          d.id,
          d.localityId,
          d.simc,
          d.name,
          d.variants,
          d.confidence,
          d.sourceUrl,
        ],
      );
      for (const s of d.streets)
        await client.query(
          "insert into district_alias_streets (alias_id, street_id, confidence, part, source_url) values ($1, $2, $3, $4, $5)",
          [d.id, s.id, s.confidence, s.part, s.sourceUrl],
        );
    }
    await client.query("commit");
    console.log("Written.");
  }
  const count = async (table: string) =>
    (await client.query(`select count(*)::int as n from ${table}`)).rows[0].n;
  console.log(
    `Rows now: district_aliases ${await count("district_aliases")}, district_alias_streets ${await count("district_alias_streets")}.`,
  );
} catch (error) {
  await client.query("rollback").catch(() => {});
  throw error;
} finally {
  await client.end();
}
