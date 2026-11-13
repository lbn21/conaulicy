// The dataset snapshot this build is made from, read once, before
// `next build` starts (npm's prebuild): the pointer's version, read from
// the Blob's origin, its place set (lib/dataset-views.ts placeSetOf) and
// its renamed places, written to .dataset-build.json (not in git).
// next.config.ts inlines the version and place set as DATASET_BUILD, so
// the build reads only that version (lib/dataset.ts), never the pointer
// again, and makes each rename's 308 (/adres/<old> and everything under
// it) from the same snapshot as the pages. Without a Blob token (CI, a
// Preview before the first snapshot): the made-up dataset
// (lib/dataset-fixture.ts). In production, no token or no pointer fails
// the build.
//   node --import ./scripts/lib/server-only.mjs scripts/dataset-build.ts
import { writeFileSync } from "node:fs";
import path from "node:path";
import { get } from "@vercel/blob";
import { fixtureDataset } from "../lib/dataset-fixture.ts";
import { type Dataset, parseDataset } from "../lib/dataset-schema.ts";
import {
  DATASET_POINTER,
  MADE_UP,
  parsePointer,
} from "../lib/dataset-store.ts";
import { placeSetOf } from "../lib/dataset-views.ts";
import { todayInWarsaw } from "../lib/dates.ts";

const OUT = path.join(import.meta.dirname, "..", ".dataset-build.json");
const production = process.env.VERCEL_ENV === "production";

/** A file of the private store, from its origin; null: none. */
async function read(pathname: string): Promise<string | null> {
  const blob = await get(pathname, { access: "private", useCache: false });
  if (blob?.statusCode !== 200) return null;
  return new Response(blob.stream).text();
}

async function snapshot(): Promise<{ version: string; dataset: Dataset }> {
  const madeUp = () => ({
    version: MADE_UP,
    dataset: fixtureDataset(todayInWarsaw()),
  });
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    if (production) throw new Error("BLOB_READ_WRITE_TOKEN is not set.");
    return madeUp();
  }
  const body = await read(DATASET_POINTER);
  if (!body) {
    if (production) throw new Error(`No ${DATASET_POINTER} in the Blob store.`);
    return madeUp();
  }
  const pointer = parsePointer(body);
  const version = await read(pointer.path);
  if (!version) throw new Error(`${pointer.path} is missing.`);
  return { version: pointer.version, dataset: parseDataset(version) };
}

const { version, dataset } = await snapshot();
const build = {
  version,
  placeSet: placeSetOf(dataset),
  redirects: dataset.redirects,
};
writeFileSync(OUT, `${JSON.stringify(build, null, 2)}\n`);
console.log(
  `Dataset for this build: ${version}, place set ${build.placeSet}, ${Object.keys(build.redirects).length} renamed.`,
);
