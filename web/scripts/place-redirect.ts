// npm run db:redirect -- --from <old id> --to <new id> --reason "<why>"
//                        [--apply] [--yes-production]
//
// A reviewed rename after the fact (docs/database.md): TERYT gives a renamed
// street a new SYM_UL, so its page id SIMC-SYM_UL changes. The TERYT reload
// records the rename with its review (etl/review/teryt/places.yaml,
// replaced_by); this is for one found later. /adres/<old>/… then answers
// 308 to the same path on the new id. Never run by an import or a workflow.
// Without --apply it only checks and prints.
//
// The old id is a retired place (the reload keeps every place, retired):
// its replaced_by is set. One deleted before places were kept (no row at
// all) gets a place_redirects row instead. Checks: the new id is a current
// place (a street or a locality); the old id is no current place and has
// no redirect yet, and is no redirect's target (no chains). Then the
// dataset snapshot is published (scripts/lib/dataset.ts).
//
// Env: IMPORT_DATABASE_URL, DATABASE_URL_UNPOOLED or DATABASE_URL;
// BLOB_READ_WRITE_TOKEN (the snapshot); optional REVALIDATE_SECRET (then the site's cache is purged, as after an import;
// site: etl/sources.yaml site.url, or SITE_URL), VERCEL_AUTOMATION_BYPASS_SECRET.
import { parseArgs } from "node:util";
import pg from "pg";
import { publishDataset } from "./lib/dataset.ts";
import { fail, guardTarget } from "./lib/import-data.ts";
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

const { from, to, reason } = args;
if (!from || !to || !reason)
  fail(
    'Usage: npm run db:redirect -- --from <old id> --to <new id> --reason "<why>" [--apply]',
  );
const url = databaseUrl();
if (!url) fail("DATABASE_URL_UNPOOLED or DATABASE_URL is not set.");
guardTarget(url, args);

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  // Its table and state: current, retired (and where to), or no row.
  const place = async (id: string) =>
    (
      await client.query(
        `select 'streets' as tbl, retired_at, replaced_by from streets where id = $1
         union all select 'localities', retired_at, replaced_by from localities where id = $1`,
        [id],
      )
    ).rows[0] as
      | { tbl: string; retired_at: string | null; replaced_by: string | null }
      | undefined;
  const target = await place(to);
  const old = await place(from);
  const problems: string[] = [];
  if (!target || target.retired_at)
    problems.push(`${to} is not a current place.`);
  if (old && !old.retired_at)
    problems.push(`${from} is still a current place: import the rename first.`);
  if (old?.replaced_by)
    problems.push(`${from} already redirects to ${old.replaced_by}.`);
  const existing = await client.query(
    `select old_id, new_id from place_redirects where old_id = $1 or new_id = $1 or old_id = $2
     union all select id, replaced_by from streets where replaced_by = $1 or (id = $2 and replaced_by is not null)
     union all select id, replaced_by from localities where replaced_by = $1 or (id = $2 and replaced_by is not null)`,
    [from, to],
  );
  for (const row of existing.rows)
    problems.push(`A redirect exists: ${row.old_id} → ${row.new_id}.`);
  if (problems.length > 0) fail(problems.join("\n"));

  console.log(`ok: /adres/${from} → /adres/${to} (${reason})`);
  if (!args.apply) {
    console.log("Dry run: nothing written. Add --apply to write.");
  } else {
    if (old)
      await client.query(
        `update ${old.tbl === "streets" ? "streets" : "localities"} set replaced_by = $2 where id = $1`,
        [from, to],
      );
    else
      await client.query(
        "insert into place_redirects (old_id, new_id, reason) values ($1, $2, $3)",
        [from, to, reason],
      );
    console.log("Written.");
    try {
      const published = await publishDataset(url);
      if (published?.changed) await revalidate();
    } catch (error) {
      fail(
        `Written, but the dataset snapshot was NOT published (the site still has no redirect): ${(error as Error).message}`,
      );
    }
  }
} finally {
  await client.end();
}
