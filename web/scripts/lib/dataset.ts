// The dataset snapshot's writer (lib/dataset-store.ts, docs/database.md):
// built from the database, read-only, and published to the private Blob
// store, a new immutable version first, the pointer last, so a failed
// write leaves the old snapshot live. Called after every change the import
// makes (scripts/import/core/run.ts, revert.ts, scripts/import.ts,
// scripts/place-redirect.ts) and by hand (scripts/dataset.ts). An
// unchanged dataset (same content hash) writes nothing.
//
// Where it writes: DATASET_DIR (tests, as ARCHIVE_DIR) if set; else the
// Blob store, which needs BLOB_READ_WRITE_TOKEN and fails without it. A
// local database (CI, db:local) holds the made-up dataset, which the site
// shows by itself (lib/dataset-fixture.ts): published only to DATASET_DIR,
// never to the Blob store.
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { get, list, put } from "@vercel/blob";
import { asc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../../db/schema.ts";
import {
  type Dataset,
  datasetFromRows,
  parseDataset,
} from "../../lib/dataset-schema.ts";
import {
  DATASET_POINTER,
  type DatasetPointer,
  datasetPath,
  isDatasetVersion,
  parsePointer,
} from "../../lib/dataset-store.ts";
import { loadDistricts } from "./districts-db.ts";
import { isLocalDatabaseUrl } from "./local-db.ts";

const {
  events,
  gminy,
  localities,
  placeRedirects,
  sourceFiles,
  streets,
  zoneMembers,
  zones,
} = schema;

/** The dataset as the database holds it now; a read-only connection. */
export async function buildDataset(
  url: string,
  { batchId = null }: { batchId?: string | null } = {},
): Promise<Dataset> {
  const pool = readOnlyPool(url);
  try {
    const db = drizzle(pool, { schema, casing: "snake_case" });
    const generatedAt = new Date().toISOString();
    const [g, l, s, z, m, e, f, r, districts] = await Promise.all([
      db.select().from(gminy).orderBy(asc(gminy.id)),
      db.select().from(localities).orderBy(asc(localities.search)),
      db.select().from(streets).orderBy(asc(streets.search)),
      db.select().from(zones).orderBy(asc(zones.id)),
      db.select().from(zoneMembers).orderBy(asc(zoneMembers.id)),
      // Only the columns the site shows: of payload, putOutBy.
      db
        .select({
          id: events.id,
          type: events.type,
          subtype: events.subtype,
          zoneId: events.zoneId,
          start: events.start,
          label: events.label,
          sourceDoc: events.sourceDoc,
          sourceUrl: events.sourceUrl,
          sourceRef: events.sourceRef,
          sourceSha256: events.sourceSha256,
          checkedAt: events.checkedAt,
          verified: events.verified,
          shiftedFrom: events.shiftedFrom,
          putOutBy: sql<string | null>`${events.payload}->>'putOutBy'`,
        })
        .from(events),
      db
        .select({ sha256: sourceFiles.sha256, seen: sourceFiles.lastSeenAt })
        .from(sourceFiles),
      db
        .select({ oldId: placeRedirects.oldId, newId: placeRedirects.newId })
        .from(placeRedirects)
        .orderBy(asc(placeRedirects.oldId)),
      loadDistricts(db),
    ]);
    return datasetFromRows(
      {
        gminy: g,
        localities: l,
        streets: s,
        zones: z,
        zoneMembers: m,
        events: e.map(({ putOutBy, ...event }) => ({
          ...event,
          payload: putOutBy ? { putOutBy } : null,
        })),
        seen: new Map(f.map((row) => [row.sha256, row.seen])),
        placeRedirects: r,
        districts,
      },
      { generatedAt, batchId, ordered: true },
    );
  } finally {
    await pool.end();
  }
}

/** Connections that may only read (each one set so as it opens). */
export function readOnlyPool(url: string): pg.Pool {
  const pool = new pg.Pool({ connectionString: url, max: 4 });
  pool.on("connect", (client) => {
    client.query("SET default_transaction_read_only = on");
  });
  return pool;
}

/** The content's hash, without when or by which batch it was built. */
function datasetHash(dataset: Dataset): string {
  const { generatedAt: _at, batchId: _batch, ...content } = dataset;
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

/** "2026-11-13T14:02:21.123Z" → "20261113T140221Z". */
const stamp = (iso: string) => `${iso.slice(0, 19).replace(/[-:]/g, "")}Z`;

// ------------------------------------------------------------------ store

type Store = {
  label: string;
  read(pathname: string): Promise<string | null>;
  /** immutable: a version, never overwritten; else the pointer. */
  write(pathname: string, body: string, immutable: boolean): Promise<void>;
  versions(): Promise<string[]>;
};

function dirStore(dir: string): Store {
  return {
    label: `DATASET_DIR ${dir}`,
    async read(pathname) {
      const file = path.join(dir, pathname);
      return existsSync(file) ? readFileSync(file, "utf8") : null;
    },
    async write(pathname, body, immutable) {
      const file = path.join(dir, pathname);
      if (immutable && existsSync(file))
        throw new Error(`${pathname} exists: a version is never overwritten.`);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, body);
    },
    async versions() {
      const versions = path.join(dir, "dataset/v");
      return existsSync(versions)
        ? readdirSync(versions).map((f) => f.replace(/\.json$/, ""))
        : [];
    },
  };
}

const blobStore: Store = {
  label: "the Blob store",
  async read(pathname) {
    const blob = await get(pathname, { access: "private", useCache: false });
    if (blob?.statusCode !== 200) return null;
    return new Response(blob.stream).text();
  },
  async write(pathname, body, immutable) {
    await put(pathname, body, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: !immutable,
      contentType: "application/json",
      // A version never changes; the pointer is read from the origin.
      cacheControlMaxAge: immutable ? 31_536_000 : 60,
    });
  },
  async versions() {
    const found: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: "dataset/v/", cursor });
      for (const blob of page.blobs)
        found.push(path.basename(blob.pathname, ".json"));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return found;
  },
};

/** DATASET_DIR, else the Blob store, which needs BLOB_READ_WRITE_TOKEN. */
function datasetStore(): Store {
  if (process.env.DATASET_DIR) return dirStore(process.env.DATASET_DIR);
  if (!process.env.BLOB_READ_WRITE_TOKEN)
    throw new Error(
      "Dataset snapshot NOT written: BLOB_READ_WRITE_TOKEN is not set (the site keeps the old snapshot). Set it (GitHub secret for the import workflow, web/.env.local by hand) and run `npm run dataset:publish`.",
    );
  return blobStore;
}

/** Where a snapshot of the database at `url` goes; null: a local one. */
function storeFor(url: string): Store | null {
  if (!process.env.DATASET_DIR && isLocalDatabaseUrl(url)) return null;
  return datasetStore();
}

async function currentPointer(store: Store): Promise<DatasetPointer | null> {
  const body = await store.read(DATASET_POINTER);
  return body ? parsePointer(body) : null;
}

export type Published = {
  version: string;
  changed: boolean;
  bytes: number;
  gzipBytes: number;
};

/**
 * Builds the snapshot from the database at `url` and publishes it if its
 * content changed. Null: a local database, nothing published. Throws on
 * any failure; the pointer then still names the old snapshot.
 */
export async function publishDataset(
  url: string,
  { batchId = null }: { batchId?: string | null } = {},
): Promise<Published | null> {
  const store = storeFor(url);
  if (!store) {
    console.log(
      "Dataset snapshot: a local database, nothing published (the site shows the made-up dataset).",
    );
    return null;
  }
  const dataset = await buildDataset(url, { batchId });
  const body = JSON.stringify(dataset);
  const sizes = {
    bytes: Buffer.byteLength(body),
    gzipBytes: gzipSync(body).length,
  };
  // The site refuses what it could not read.
  parseDataset(body);
  const sha256 = datasetHash(dataset);
  const pointer = await currentPointer(store);
  if (pointer?.sha256 === sha256) {
    console.log(
      `Dataset snapshot unchanged: ${pointer.version} (${store.label}).`,
    );
    return { version: pointer.version, changed: false, ...sizes };
  }
  const version = `${stamp(dataset.generatedAt)}-${sha256.slice(0, 12)}`;
  await store.write(datasetPath(version), body, true);
  const next: DatasetPointer = {
    version,
    path: datasetPath(version),
    sha256,
    generatedAt: dataset.generatedAt,
    previous: pointer?.version ?? null,
  };
  await store.write(DATASET_POINTER, JSON.stringify(next), false);
  console.log(
    `Dataset snapshot published: ${version} (${store.label}; ${sizes.bytes} bytes, ${sizes.gzipBytes} gzip; previous ${next.previous ?? "none"}).`,
  );
  return { version, changed: true, ...sizes };
}

/**
 * Points the site back (or forward) at a published version, after checking
 * it reads. The versions themselves never change.
 */
export async function rollbackDataset(
  version: string,
): Promise<DatasetPointer> {
  if (!isDatasetVersion(version))
    throw new Error(`${version} is not a dataset version (see dataset:list).`);
  const store = datasetStore();
  const body = await store.read(datasetPath(version));
  if (!body)
    throw new Error(`${datasetPath(version)} is not in ${store.label}.`);
  const dataset = parseDataset(body);
  const pointer = await currentPointer(store);
  const next: DatasetPointer = {
    version,
    path: datasetPath(version),
    sha256: datasetHash(dataset),
    generatedAt: dataset.generatedAt,
    previous: pointer?.version ?? null,
  };
  await store.write(DATASET_POINTER, JSON.stringify(next), false);
  return next;
}

/** Every published version, oldest first, and the current one. */
export async function datasetVersions(): Promise<{
  versions: string[];
  current: string | null;
}> {
  const store = datasetStore();
  const [versions, pointer] = await Promise.all([
    store.versions(),
    currentPointer(store),
  ]);
  return { versions: versions.sort(), current: pointer?.version ?? null };
}
