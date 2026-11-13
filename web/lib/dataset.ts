import "server-only";
import { type Dataset, parseDataset } from "./dataset-schema.ts";
import {
  DATASET_POINTER,
  datasetPath,
  MADE_UP,
  parsePointer,
} from "./dataset-store.ts";
import { placeSetOf } from "./dataset-views.ts";
import { todayInWarsaw } from "./dates.ts";
import { readBlobFile } from "./live-store.ts";

// The site's one source of places and dates: the dataset snapshot in the
// private Blob store (lib/dataset-store.ts), never the database (Neon is
// the import's alone; docs/database.md). Every page is prerendered from it
// and cached under the dataset tag (lib/page-cache.ts).
//
// Which version (one rule, so no page ever links a page the build did not
// make; docs/database.md, „The dataset snapshot”):
// - During `next build`: only the version the prebuild step read
//   (scripts/dataset-build.ts, DATASET_BUILD), never the pointer again, so
//   an import published mid-build cannot mix versions.
// - At run time (a page re-rendered after a revalidation): the pointer's
//   version when its place set (lib/dataset-views.ts placeSetOf) is the
//   build's, else the build's own, immutable version; a new place set
//   gets a new deployment instead (lib/dataset-sync.ts).
//
// Without a published snapshot, or a Blob token, the site shows the
// made-up dataset (lib/dataset-fixture.ts), as the live mocks do (ZUK_MOCK,
// lib/zuk-store.ts): CI's build, a Preview before the first snapshot,
// `next dev`. DATASET_DIR (scripts/check-import.mjs) reads a snapshot the
// import wrote to a directory instead (scripts/lib/dataset.ts). Never in
// production, where any of these is an error.

/** What the prebuild step read: next.config.ts inlines it as DATASET_BUILD. */
export type DatasetBuild = {
  /** A version (lib/dataset-store.ts), or MADE_UP. */
  version: string;
  /** Its place set (placeSetOf). */
  placeSet: string;
};

/** This build's snapshot; null outside a build's output (`next dev`, tests). */
export function datasetBuild(
  json = process.env.DATASET_BUILD,
): DatasetBuild | null {
  if (!json) return null;
  const { version, placeSet } = JSON.parse(json) as DatasetBuild;
  return { version, placeSet };
}

const production = () => process.env.VERCEL_ENV === "production";
const building = () => process.env.NEXT_PHASE === "phase-production-build";

/** A file of the snapshot's store: DATASET_DIR outside production, else the Blob. */
async function readStore(pathname: string): Promise<string | null> {
  const dir = production() ? undefined : process.env.DATASET_DIR;
  if (!dir) return readBlobFile(pathname, { cdn: true });
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  return readFile(join(dir, pathname), "utf8").catch(() => null);
}

/** Whether there is a store to read: a Blob token or DATASET_DIR. */
const hasStore = () =>
  Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.DATASET_DIR);

/**
 * The current pointer's version, or MADE_UP when nothing is published
 * here (never in production). Read through the Blob's CDN (at most 60 s
 * behind a write; the import waits that long before it revalidates), at
 * most once in 10 s per instance.
 */
let pointer: { at: number; version: Promise<string> } | null = null;
export function latestVersion(): Promise<string> {
  if (pointer && Date.now() - pointer.at < 10_000) return pointer.version;
  const version = (async () => {
    if (!hasStore()) {
      if (production())
        throw new Error("Dataset: BLOB_READ_WRITE_TOKEN is not set.");
      return MADE_UP;
    }
    const body = await readStore(DATASET_POINTER);
    if (body) return parsePointer(body).version;
    if (production())
      throw new Error(`Dataset: no ${DATASET_POINTER} in the Blob store.`);
    return MADE_UP;
  })();
  pointer = { at: Date.now(), version };
  version.catch(() => {
    if (pointer?.version === version) pointer = null;
  });
  return version;
}

/** Versions read, by name: immutable, so each is read once per instance. */
const versions = new Map<string, Promise<Dataset>>();

/**
 * A version's snapshot, checked (lib/dataset-schema.ts); MADE_UP: the
 * made-up dataset for today (its dates move with the day, its places
 * never).
 */
export function readVersion(version: string): Promise<Dataset> {
  const key = version === MADE_UP ? `${MADE_UP}:${todayInWarsaw()}` : version;
  let dataset = versions.get(key);
  if (!dataset) {
    dataset =
      version === MADE_UP
        ? import("./dataset-fixture.ts").then((m) => {
            console.warn(
              "Dataset: no snapshot published here; showing the made-up dataset.",
            );
            return m.fixtureDataset(todayInWarsaw());
          })
        : readStore(datasetPath(version)).then((body) => {
            if (!body)
              throw new Error(`Dataset: ${datasetPath(version)} is missing.`);
            return parseDataset(body);
          });
    // Two at most: the build's and the latest (and a made-up day's).
    if (versions.size >= 2)
      versions.delete(versions.keys().next().value as string);
    versions.set(key, dataset);
    dataset.catch(() => {
      if (versions.get(key) === dataset) versions.delete(key);
    });
  }
  return dataset;
}

/** The version the pages read now (see above). */
export async function servedVersion(): Promise<string> {
  const build = datasetBuild();
  if (!build) return latestVersion();
  if (building()) return build.version;
  const latest = await latestVersion();
  if (latest === build.version) return latest;
  return placeSetOf(await readVersion(latest)) === build.placeSet
    ? latest
    : build.version;
}

/** The dataset snapshot the pages read now (servedVersion). */
export async function getDataset(): Promise<Dataset> {
  return readVersion(await servedVersion());
}
