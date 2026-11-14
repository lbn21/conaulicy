import "server-only";
import type { LiveReads } from "./live-reads.ts";
import {
  type PageDef,
  pageDigest,
  pageTag,
  SOURCE_TAGS,
  type SourceTag,
} from "./page-cache.ts";
import type { Prewarmed } from "./prewarm.ts";

// How the zuk cron (app/api/cron/zuk/route.ts: its live sources every 15
// minutes, its water sources every 4 hours; lib/cadence.ts) keeps the
// prerendered pages current: page by page, by digest. After its run it
// works out every page's view (lib/pages.ts allPages) from the files it
// read and wrote, at its clock, and hashes it (lib/page-digest.ts). A page
// whose digest is not the one in DIGESTS_PATH (or that has none there) has
// changed: its own tag is revalidated with the "max" profile WAIT_MS after
// the run's last write (the Blob's CDN, up to 60 s behind; every file is
// written with cacheControlMaxAge 60), every changed page in the run; the
// views are worked out during that wait. Two steps, in this order:
// - planAndRevalidate, awaited in the route handler: the wait, the
//   revalidations and the new digests. Next.js sends a handler's
//   revalidations to the cache when the handler returns, before its
//   response is sent; a revalidation made inside after() is sent only once
//   every after() callback has finished, so a pre-warm in the same after()
//   would read the old pages.
// - warmPages, inside after(): every changed page pre-warmed, the home
//   page first, as long as the function's time lasts (lib/prewarm.ts: no
//   count limit; a page whose purge has not arrived yet is tried again); a
//   page the time did not reach is served stale once and re-rendered on
//   its next visit. It logs the run's one line.
// The new digests are written once the revalidations are queued, and only
// when one changed: the cron is the file's only writer.
//
// One mechanism for every change: a source's content, a new Warsaw day
// (the day words and the 7-day window are in the views), an instant
// passing (a cut begun, a warning over). A run that only re-checked
// changes no view, so it re-renders nothing.
//
// At its start the run reads the home page's HTML (LIVE_ATTR, one GET):
// the digest it was rendered with, its dataset version (lib/dataset-sync.ts)
// and each live source's run id. A home page whose digest is not the
// stored one was not re-rendered as revalidated (a revalidation lost, or
// its re-render read the Blob's CDN too early): the run forgets the
// digests of the home page and of every page reading a source whose run
// id it rendered is not the one the run read at its start (what the run
// before left), so they go through the same path again.

/** The wait after the last write: the Blob CDN's 60 s and a margin. */
export const WAIT_MS = 65_000;

/** The cron's own time it may not use: the wait and a margin (maxDuration). */
export const REFRESH_RESERVE_S = 70;

/** Every page's digest, by path: the zuk cron's alone. */
export const DIGESTS_PATH = "status/page-digests.json";

/** The home page's attribute with the marks it was rendered with. */
export const LIVE_ATTR = "data-live";

/**
 * What the home page was rendered with: its own digest, the dataset
 * version and each live source's run id, by its key (lib/live-status.ts:
 * "imgw", "pge", "water:<id>"); null: no data.
 */
export type LiveMarks = {
  digest: string;
  dataset: string;
  runs: Record<string, string | null>;
};

/** The marks' attribute value, as the home page writes it. */
export const marksAttr = (marks: LiveMarks) => JSON.stringify(marks);

/** The marks in a page's HTML, or null: none, or not the shape. */
export function marksOf(html: string): LiveMarks | null {
  const match = new RegExp(`${LIVE_ATTR}="([^"]*)"`).exec(html);
  if (!match) return null;
  try {
    const value = JSON.parse(
      match[1]
        .replaceAll("&quot;", '"')
        .replaceAll("&#x27;", "'")
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("&amp;", "&"),
    ) as LiveMarks;
    if (
      typeof value?.digest !== "string" ||
      typeof value.dataset !== "string" ||
      !value.runs ||
      typeof value.runs !== "object"
    )
      return null;
    return value;
  } catch {
    return null;
  }
}

export type Digests = Record<string, string>;

/** The digests file's map; none, or not one: empty (every page changed). */
function parseDigests(body: string | null): Digests {
  if (!body) return {};
  try {
    const value = JSON.parse(body) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(([, d]) => typeof d === "string"),
    ) as Digests;
  } catch {
    return {};
  }
}

/** A page as the run sees it: its path, its sources and its digest now. */
export type PageDigest = { path: string; sources: SourceTag[]; digest: string };

/** Every page's digest from `reads`, in `defs`' order. */
export async function pageDigests(
  defs: PageDef<unknown>[],
  reads: LiveReads,
): Promise<PageDigest[]> {
  return Promise.all(
    defs.map(async (def) => ({
      path: def.path,
      sources: def.sources,
      digest: pageDigest(def, await def.load(reads), reads.now),
    })),
  );
}

/** A source key's tag: every water source is "water". */
const tagOf = (key: string): SourceTag =>
  key.startsWith("water:") ? SOURCE_TAGS.water : (key as SourceTag);

/**
 * The home page lagging (its rendered digest not the stored one): the
 * tags of the sources whose run id it rendered is not `runs`' (as the run
 * read them at its start, before its own writes); null: not lagging, or
 * nothing to compare (no marks, no stored digest).
 */
export function laggingTags(
  marks: LiveMarks | null,
  stored: Digests,
  runs: Record<string, string | null>,
): SourceTag[] | null {
  const home = stored["/"];
  if (!marks || home === undefined || marks.digest === home) return null;
  const tags = new Set<SourceTag>();
  for (const [key, run] of Object.entries(runs))
    if ((marks.runs[key] ?? null) !== run) tags.add(tagOf(key));
  return [...tags];
}

export type Plan = {
  /** Every changed page, in order: each revalidated this run. */
  changed: string[];
  /** Every page's digest now: kept once the revalidations went through. */
  next: Digests;
};

/**
 * Which pages to revalidate: those whose digest is not the stored one (or
 * that have none), and, the home page lagging (`lag`, laggingTags), the
 * home page and every page reading a lagging source. A page no longer
 * listed is dropped from the file.
 */
export function planRefresh(
  stored: Digests,
  pages: PageDigest[],
  lag: SourceTag[] | null,
): Plan {
  const forgotten = (page: PageDigest) =>
    lag !== null &&
    (page.path === "/" || page.sources.some((tag) => lag.includes(tag)));
  return {
    changed: pages
      .filter((page) => forgotten(page) || stored[page.path] !== page.digest)
      .map(({ path }) => path),
    next: Object.fromEntries(pages.map((page) => [page.path, page.digest])),
  };
}

export type RefreshDeps = {
  /** Every page's digest now, home first (pageDigests). */
  pages(): Promise<PageDigest[]>;
  /** The home page's marks, read at the run's start; null: none. */
  marks: LiveMarks | null;
  /**
   * Each live source's run id as the run read it at its start, before its
   * own writes: what the run before left for the home page to render.
   */
  runs: Record<string, string | null>;
  /** The digests file, from the Blob's origin; and its write. */
  read(): Promise<string | null>;
  write(body: string): Promise<void>;
  /**
   * The wait from the run's last write before revalidating anything:
   * WAIT_MS, or 0 when the run wrote nothing; the views are worked out
   * meanwhile, and only the rest is slept.
   */
  wait: number;
  /** The clock (ms): the wait counts from the call. */
  clock(): number;
  sleep(ms: number): Promise<void>;
  /**
   * The dataset tag is to be revalidated this run (lib/dataset-sync.ts): it
   * re-renders every page, so no page tag is needed, and every digest is
   * kept as it is now.
   */
  dataset: boolean;
  revalidateTag(tag: string): void;
  log(line: Record<string, unknown>): void;
};

/** What a run revalidated: its pre-warm's list and its log line's counts. */
export type Revalidated = {
  /** Every page revalidated, home first: the pre-warm's list. */
  paths: string[];
  pagesChanged: number;
  viewsMs: number;
  /** When the revalidations were made (the clock, ms). */
  at: number;
  dataset: boolean;
};

/**
 * One run's plan, wait, revalidations and digests (see above), awaited in
 * the route handler, never inside after(); null on an error, logged, and
 * then nothing is pre-warmed. Never throws.
 */
export async function planAndRevalidate(
  deps: RefreshDeps,
): Promise<Revalidated | null> {
  try {
    const start = deps.clock();
    const [pages, body] = await Promise.all([deps.pages(), deps.read()]);
    const viewsMs = deps.clock() - start;
    const stored = parseDigests(body);
    const lag = laggingTags(deps.marks, stored, deps.runs);
    if (lag) deps.log({ refresh: "home-lagging", sources: lag });
    const plan = planRefresh(stored, pages, lag);
    if (deps.dataset || plan.changed.length > 0) {
      const rest = deps.wait - (deps.clock() - start);
      if (rest > 0) await deps.sleep(rest);
    }
    // Every changed page now, in one batch: queued here, sent to the cache
    // when the route handler returns, before after() starts.
    if (deps.dataset) deps.revalidateTag(SOURCE_TAGS.dataset);
    else for (const path of plan.changed) deps.revalidateTag(pageTag(path));
    const at = deps.clock();
    if (JSON.stringify(plan.next) !== JSON.stringify(stored))
      await deps.write(JSON.stringify(plan.next));
    return {
      paths: deps.dataset ? pages.map(({ path }) => path) : plan.changed,
      pagesChanged: plan.changed.length,
      viewsMs,
      at,
      dataset: deps.dataset,
    };
  } catch (error) {
    deps.log({ refresh: "error", error: (error as Error).message });
    return null;
  }
}

export type WarmDeps = {
  /**
   * Every path given, the home page first, within the function's time;
   * `since`: when they were revalidated (lib/prewarm.ts).
   */
  prewarm(paths: string[], since: number): Promise<Prewarmed>;
  clock(): number;
  log(line: Record<string, unknown>): void;
};

/**
 * The pre-warm of what planAndRevalidate revalidated, inside after(), and
 * the run's one line. Nothing revalidated (null): nothing. Never throws.
 */
export async function warmPages(
  done: Revalidated | null,
  deps: WarmDeps,
): Promise<void> {
  if (!done) return;
  try {
    const warmStart = deps.clock();
    const { warmed, failed, skipped, notPurged } =
      done.paths.length > 0
        ? await deps.prewarm(done.paths, done.at)
        : { warmed: 0, failed: 0, skipped: 0, notPurged: 0 };
    const warmMs = deps.clock() - warmStart;
    deps.log({
      pagesChanged: done.pagesChanged,
      pagesRevalidated: done.paths.length,
      prewarmed: warmed,
      // Not reached in the function's time (the only limit); failed GETs apart.
      notWarmed: skipped,
      // Still the old page at the function's end: its purge never arrived.
      notPurged,
      ...(failed > 0 && { warmFailed: failed }),
      viewsMs: done.viewsMs,
      warmMs,
      ...(done.dataset && { dataset: "revalidated" }),
    });
  } catch (error) {
    deps.log({ refresh: "error", error: (error as Error).message });
  }
}
