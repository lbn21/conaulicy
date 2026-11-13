import "server-only";
import { type ImgwRead, imgwCopyOf } from "./imgw-shown.ts";
import { upstream as imgwUpstream } from "./imgw-warnings.ts";
import { RUN_PATHS, runIdsOf } from "./live-runs.ts";
import {
  failingSince,
  liveCopyOf,
  PGE_KEY,
  parseChecks,
  UNREADABLE,
  waterKey,
} from "./live-status.ts";
import {
  CHECKS_PATH,
  FEED_PATH,
  PGE_PATH,
  readBlobFile,
} from "./live-store.ts";
import { parseOutagesFile, upstream as pgeUpstream } from "./pge-feed.ts";
import type { PgeRead } from "./power-module.ts";
import {
  WATER_SOURCES,
  type WaterSource,
  type WaterSourceId,
} from "./water-sources.ts";
import { parseZukFile, type ZukData, zukView } from "./zuk-data.ts";

// What a page reads of the live sources, at one clock: IMGW's and PGE's
// last good copies, every water source's data and each source's run id,
// from one file reader. A page's render reads the Blob's CDN copy (cdnFile;
// lib/page-cache.ts pageData); the zuk cron, working out every page's view
// for its digest (lib/page-refresh.ts), the bodies it read and wrote this
// run, so both see the same data with no Blob read of the cron's own. Each
// read is made once per LiveReads, however many pages ask.

/** A file's body, or null: none yet. Throws when it cannot be read. */
export type FileRead = (path: string) => Promise<string | null>;

export type LiveReads = {
  /** The clock (ms) the pages are worked out at. */
  now: number;
  imgw(): Promise<ImgwRead>;
  pge(): Promise<PgeRead>;
  /** Every water source's data, by its id: lib/water-module.ts water(). */
  water(): Promise<Record<WaterSourceId, ZukData>>;
  /** Each live source's run id (lib/live-runs.ts), by its key. */
  runs(): Promise<Record<string, string | null>>;
};

/** Through the Blob's CDN: what a page reads when it is rendered. */
export const cdnFile: FileRead = (path) => readBlobFile(path, { cdn: true });

/** Two files from a mock's upstream (lib/imgw-mock.ts, lib/pge-mock.ts). */
type MockFiles = (
  url: string,
  now: number,
) => Promise<{ feed: string | null; checks: string | null }>;

/**
 * A live feed's last good copy. `url` is the upstream's: a "mock:…" one
 * (outside production only, its upstream() refuses it there) reads the
 * mock's files instead (no Blob needed). null: the cron has written none
 * yet. A file unreadable, or not one: UNREADABLE, an expected error as a
 * value, which the pages render as a notice (Next.js, "Handling expected
 * errors"); every page renders as ever.
 */
async function liveRead<C>(
  name: string,
  url: string,
  path: string,
  { now, file }: { now: number; file: FileRead },
  mock: () => Promise<MockFiles>,
  copyOf: (feed: string | null, checks: string | null) => C | null,
): Promise<C | null | typeof UNREADABLE> {
  try {
    if (url.startsWith("mock:")) {
      const { feed, checks } = await (await mock())(url, now);
      return copyOf(feed, checks);
    }
    const [feed, checks] = await Promise.all([file(path), file(CHECKS_PATH)]);
    return copyOf(feed, checks);
  } catch (error) {
    console.warn(`${name} store: unreadable (${(error as Error).message})`);
    return UNREADABLE;
  }
}

/**
 * IMGW's last good feed and its last good check: the weather module's
 * (lib/modules.ts). `preview`: a scenario's mock upstream
 * (lib/imgw-preview.ts, /podglad/imgw/…), outside production only.
 */
export async function imgwCopy(
  at: { now: number; file: FileRead },
  preview: string | null = null,
): Promise<ImgwRead> {
  return liveRead(
    "IMGW",
    preview ?? (await imgwUpstream()).url,
    FEED_PATH,
    at,
    async () => (await import("./imgw-mock.ts")).mockFiles,
    imgwCopyOf,
  );
}

/**
 * ZUK_MOCK (the gmina's) and MZGKIM_MOCK, each a fixture post's id, its id
 * with "-failing", or "none", serve a fixture file (lib/water-fixture.ts
 * mockFile) instead of the Blob, as PGE_API_URL's mock (lib/pge-feed.ts):
 * anywhere but production (VERCEL_ENV), so CI's built site and `next dev`
 * on db:local show a dated cut on the fixture's town street (t370).
 */
async function mockView(
  source: WaterSource,
  now: Date,
): Promise<ZukData | null> {
  const name =
    source.id === "mzgkim" ? process.env.MZGKIM_MOCK : process.env.ZUK_MOCK;
  if (!name) return null;
  if (process.env.VERCEL_ENV === "production") {
    console.error("ZUK_MOCK, MZGKIM_MOCK: the mock is off in production");
    return null;
  }
  const { mockFailing, mockFile } = await import("./water-fixture.ts");
  const file = mockFile(name, now.getTime());
  return file === undefined
    ? null
    : zukView(file, now, source, mockFailing(name));
}

/**
 * One source's water cuts and notices (lib/water-module.ts). No file, or
 * its checks failing (the status file): `stale` (lib/zuk-data.ts).
 */
async function sourceData(
  source: WaterSource,
  now: Date,
  file: (path: string) => Promise<string | null>,
): Promise<ZukData> {
  const mock = await mockView(source, now);
  if (mock) return mock;
  const body = await file(source.pathname);
  const failing =
    failingSince(parseChecks(await file(CHECKS_PATH)), waterKey(source.id)) !==
    null;
  return zukView(body ? parseZukFile(body) : null, now, source, failing);
}

/** The live reads at `now` from `file`, each made once. */
export function liveReads(now: number, file: FileRead): LiveReads {
  const bodies = new Map<string, Promise<string | null>>();
  const read: FileRead = (path) => {
    let body = bodies.get(path);
    if (!body) {
      body = file(path);
      bodies.set(path, body);
    }
    return body;
  };
  // A water file that cannot be read: no file, so its source says it
  // could not be checked.
  const quiet = (path: string) =>
    read(path).catch((error: Error) => {
      console.error(`${path}: ${error.message}`);
      return null;
    });
  const once = <T>(load: () => Promise<T>) => {
    let value: Promise<T> | undefined;
    return () => {
      value ??= load();
      return value;
    };
  };
  const at = { now, file: read };
  return {
    now,
    imgw: once(() => imgwCopy(at)),
    pge: once(async () =>
      liveRead(
        "PGE",
        (await pgeUpstream()).url,
        PGE_PATH,
        at,
        async () => (await import("./pge-mock.ts")).mockFiles,
        (feed, checks) => liveCopyOf(parseOutagesFile(feed), checks, PGE_KEY),
      ),
    ),
    water: once(async () => {
      const views = await Promise.all(
        WATER_SOURCES.map((s) => sourceData(s, new Date(now), quiet)),
      );
      return Object.fromEntries(
        WATER_SOURCES.map((s, i) => [s.id, views[i]]),
      ) as Record<WaterSourceId, ZukData>;
    }),
    runs: once(async () => {
      const bodies = await Promise.all(
        RUN_PATHS.map((path) => read(path).catch(() => null)),
      );
      return runIdsOf(
        Object.fromEntries(RUN_PATHS.map((path, i) => [path, bodies[i]])),
      );
    }),
  };
}
