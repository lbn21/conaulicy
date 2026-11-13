// The dataset snapshot by hand (docs/database.md, "The dataset snapshot"):
//
//   npm run dataset:build [-- --out <file>]   build from the database,
//                                             read-only; print its size
//   npm run dataset:publish                   build and publish it if it
//                                             changed, then revalidate
//   npm run dataset:list                      the published versions
//   npm run dataset:rollback -- --to <version>
//                                             point the site at an older
//                                             (or newer) version, then
//                                             revalidate
//
// The import publishes on its own after every change; publish by hand
// after a change it did not make (db:districts, a migration's data). Every
// command reads the database read-only; publish and rollback write only
// the Blob store. The import workflow runs them as modes snapshot and
// rollback (.github/workflows/import.yml).
//
// Env: IMPORT_DATABASE_URL, DATABASE_URL_UNPOOLED or DATABASE_URL (build,
// publish); BLOB_READ_WRITE_TOKEN (publish, list, rollback; or DATASET_DIR
// instead of the Blob store); REVALIDATE_SECRET, SITE_URL,
// VERCEL_AUTOMATION_BYPASS_SECRET (scripts/lib/revalidate.ts).
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { gzipSync } from "node:zlib";
import {
  buildDataset,
  datasetVersions,
  publishDataset,
  rollbackDataset,
} from "./lib/dataset.ts";
import { fail } from "./lib/import-data.ts";
import { databaseUrl } from "./lib/local-db.ts";
import { revalidate } from "./lib/revalidate.ts";

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: { out: { type: "string" }, to: { type: "string" } },
});
const [command] = positionals;

function dbUrl(): string {
  const url = databaseUrl();
  if (!url)
    fail(
      "IMPORT_DATABASE_URL, DATABASE_URL_UNPOOLED or DATABASE_URL is not set.",
    );
  return url;
}

try {
  if (command === "build") {
    const dataset = await buildDataset(dbUrl());
    const body = JSON.stringify(dataset);
    console.log(
      `Dataset: ${dataset.streets.length} streets, ${dataset.localities.length} localities, ${dataset.zones.length} zones, ${dataset.events.length} events, ${dataset.districts.length} districts; ${Buffer.byteLength(body)} bytes, ${gzipSync(body).length} gzip.`,
    );
    if (args.out) {
      writeFileSync(args.out, body);
      console.log(`Written to ${args.out}.`);
    }
  } else if (command === "publish") {
    const published = await publishDataset(dbUrl());
    if (published?.changed) await revalidate();
  } else if (command === "list") {
    const { versions, current } = await datasetVersions();
    for (const version of versions)
      console.log(`${version === current ? "*" : " "} ${version}`);
    if (versions.length === 0) console.log("No versions published yet.");
  } else if (command === "rollback") {
    if (!args.to)
      fail(
        "Usage: npm run dataset:rollback -- --to <version> (see dataset:list)",
      );
    const pointer = await rollbackDataset(args.to);
    console.log(
      `The site now reads ${pointer.version} (was ${pointer.previous ?? "none"}). Undo: npm run dataset:rollback -- --to ${pointer.previous}`,
    );
    await revalidate();
  } else {
    fail(
      "Usage: npm run dataset:<build|publish|list|rollback> (scripts/dataset.ts)",
    );
  }
} catch (error) {
  fail((error as Error).message);
}
