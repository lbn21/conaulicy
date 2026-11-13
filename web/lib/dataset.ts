import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { type Dataset, parseDataset } from "./dataset-schema.ts";
import {
  DATASET_POINTER,
  type DatasetPointer,
  parsePointer,
} from "./dataset-store.ts";
import { todayInWarsaw } from "./dates.ts";
import { DATASET } from "./headers.ts";
import { readBlobFile } from "./live-store.ts";

// The site's one source of places and dates: the dataset snapshot in the
// private Blob store (lib/dataset-store.ts), never the database (Neon is
// the import's alone; docs/database.md). The pointer names the current
// version: read from the Blob's origin, cached as every page's data
// (cacheLife max, the dataset tag), so an import's POST /api/revalidate
// makes the next request read the new one. A version never changes, so
// each instance keeps the one it read until the pointer moves; pages filter
// it by day and house number per request (lib/dataset-views.ts).
//
// Without a published snapshot, or a Blob token, the site shows the
// made-up dataset (lib/dataset-fixture.ts), as the live mocks do (ZUK_MOCK,
// lib/zuk-store.ts): CI's build, a Preview before the first snapshot,
// `next dev`. DATASET_DIR (scripts/check-import.mjs) reads a snapshot the
// import wrote to a directory instead (scripts/lib/dataset.ts). Never in
// production, where any of these is an error.

const production = () => process.env.VERCEL_ENV === "production";

/** A file of the snapshot's store: DATASET_DIR outside production, else the Blob. */
async function readStore(
  pathname: string,
  options?: { cdn: boolean },
): Promise<string | null> {
  const dir = production() ? undefined : process.env.DATASET_DIR;
  if (!dir) return readBlobFile(pathname, options);
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  return readFile(join(dir, pathname), "utf8").catch(() => null);
}

/** Where the made-up dataset stands in: its day, as CI's database's dates. */
type MadeUp = { madeUp: string };

/** The current pointer, or the made-up dataset's day. */
async function datasetPointer(): Promise<DatasetPointer | MadeUp> {
  "use cache";
  cacheLife("max");
  cacheTag(DATASET);
  const madeUp = { madeUp: todayInWarsaw() };
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.DATASET_DIR) {
    if (production())
      throw new Error("Dataset: BLOB_READ_WRITE_TOKEN is not set.");
    return madeUp;
  }
  const body = await readStore(DATASET_POINTER);
  if (body) return parsePointer(body);
  if (production())
    throw new Error(`Dataset: no ${DATASET_POINTER} in the Blob store.`);
  return madeUp;
}

let loaded: { key: string; dataset: Promise<Dataset> } | null = null;

async function readVersion(pointer: DatasetPointer): Promise<Dataset> {
  const body = await readStore(pointer.path, { cdn: true });
  if (!body) throw new Error(`Dataset: ${pointer.path} is missing.`);
  return parseDataset(body);
}

async function madeUp(today: string): Promise<Dataset> {
  console.warn(
    "Dataset: no snapshot published here; showing the made-up dataset.",
  );
  return (await import("./dataset-fixture.ts")).fixtureDataset(today);
}

/** The current dataset snapshot, checked (lib/dataset-schema.ts). */
export async function getDataset(): Promise<Dataset> {
  const pointer = await datasetPointer();
  const key =
    "madeUp" in pointer ? `made-up:${pointer.madeUp}` : pointer.version;
  if (loaded?.key !== key) {
    const dataset =
      "madeUp" in pointer ? madeUp(pointer.madeUp) : readVersion(pointer);
    loaded = { key, dataset };
    // A failed read is tried again by the next request.
    dataset.catch(() => {
      if (loaded?.dataset === dataset) loaded = null;
    });
  }
  return loaded.dataset;
}
