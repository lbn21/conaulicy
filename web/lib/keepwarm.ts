// The keep-warm (app/api/cron/keepwarm/route.ts): Vercel evicts an ISR
// entry nobody accessed for 31 days (vercel.com/docs/incremental-static-
// regeneration/limits-and-pricing, „ISR cache region”), and its first
// visitor after that waits for a render. Once a day one GET for each path
// of the day's slice, the 7 slices in turn, so every prerendered page and
// file is read by us at least once every 7 days, whatever its traffic.
//
// The paths: every page and file the build makes, from the sources the
// build reads them from (lib/pages.ts, lib/static-pages.ts, the routes'
// generateStaticParams sources); keepwarm.test.ts fails on a route of
// app/ that has none. A path's slice is a stable hash of it, so a new path
// moves no other; the day's slice is the UTC day since 1970, mod 7.
//
// Through lib/prewarm.ts, its fetch, concurrency and time, with no
// revalidation (`since: null`): a HIT counts, the point is the access (a
// HIT exists only if its edge filled from the durable store within the
// CDN's minutes-to-hours lifetime; a MISS reads it then). What the time
// did not reach is logged as `remaining` and read next week: no chaining.
// Production only: a preview's pages are not kept.

import "server-only";
import { NO_STORE } from "./headers.ts";
import { imgwPreviewParams } from "./imgw-preview.ts";
import { allPages } from "./pages.ts";
import type { Prewarmed } from "./prewarm.ts";
import { productionCronDenied } from "./secret.ts";
import { STATIC_PAGES } from "./static-pages.ts";

/** The slices: every path read once in this many days. */
export const KEEPWARM_DAYS = 7;

/**
 * The metadata routes' files: app/robots.ts, app/manifest.ts and app/'s
 * icons (the sitemap is lib/pages.ts's).
 */
const METADATA_FILES = [
  "/robots.txt",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icon.svg",
];

/**
 * Every path this deployment serves from its prerendered output, sorted:
 * the pages and files of the dataset, the site's own pages, the metadata
 * files and the preview pages (none in production).
 */
export async function keepWarmPaths(): Promise<string[]> {
  const paths = [
    ...(await allPages()).map(({ path }) => path),
    ...STATIC_PAGES.map(({ path }) => path),
    ...METADATA_FILES,
    ...imgwPreviewParams().map(
      ({ scenario }) => `/podglad/imgw/${encodeURIComponent(scenario)}`,
    ),
  ];
  return [...new Set(paths)].sort();
}

/** A path's slice, 0 to KEEPWARM_DAYS - 1: its FNV-1a hash, mod the days. */
export function sliceOf(path: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(path)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % KEEPWARM_DAYS;
}

/** The slice read on the UTC day of `now`. */
export const dailySlice = (now: number) =>
  Math.floor(now / 86_400_000) % KEEPWARM_DAYS;

export type KeepWarmDeps = {
  /** VERCEL_ENV: "production", "preview" or "development". */
  vercelEnv: string | undefined;
  paths(): Promise<string[]>;
  /** lib/prewarm.ts with no revalidation, until the function's end. */
  prewarm(paths: string[]): Promise<Prewarmed>;
  now(): number;
  log(line: Record<string, unknown>): void;
};

export async function handleKeepWarmCron(
  request: Request,
  cronSecret: string | undefined,
  deps: KeepWarmDeps,
): Promise<Response> {
  const denied = productionCronDenied(request, cronSecret, deps.vercelEnv);
  if (denied) return denied;
  const start = deps.now();
  const slice = dailySlice(start);
  try {
    const all = await deps.paths();
    const paths = all.filter((path) => sliceOf(path) === slice);
    const { warmed, failed, skipped, cache } = await deps.prewarm(paths);
    const { hit = 0, stale = 0, miss = 0, prerender = 0, ...rest } = cache;
    const other = Object.values(rest).reduce((n, count) => n + count, 0);
    const line = {
      keepwarm: "run",
      slice,
      // The slice's paths, of all the deployment's.
      total: paths.length,
      all: all.length,
      requested: warmed + failed,
      hit,
      stale,
      miss,
      prerender,
      ...(other > 0 && { other }),
      errors: failed,
      // Not reached in the function's time: read next week.
      ...(skipped > 0 && { remaining: skipped }),
      ms: deps.now() - start,
    };
    deps.log(line);
    return Response.json(line, { headers: NO_STORE });
  } catch (error) {
    const message = (error as Error).message;
    deps.log({ keepwarm: "error", slice, error: message });
    return Response.json(
      { error: message },
      { status: 500, headers: NO_STORE },
    );
  }
}
