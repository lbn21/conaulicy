import "server-only";
import type { LiveReads } from "./live-reads.ts";
import {
  type PageDef,
  pageDigest,
  pageTag,
  SOURCE_TAGS,
  type SourceTag,
} from "./page-cache.ts";
import { PREWARM_MAX } from "./prewarm.ts";

// How the zuk cron (app/api/cron/zuk/route.ts, every 15 minutes) keeps the
// prerendered pages current: page by page, by digest. After its run it
// works out every page's view (lib/pages.ts allPages) from the files it
// read and wrote, at its clock, and hashes it (lib/page-digest.ts). A page
// whose digest is not the one in DIGESTS_PATH (or that has none there) has
// changed: its own tag is revalidated with the "max" profile WAIT_MS after
// the run's last write (the Blob's CDN, up to 60 s behind; every file is
// written with cacheControlMaxAge 60), inside after(), then the page is
// pre-warmed; at most PREWARM_MAX a run, the home page first, the rest the
// next run. The new digests are written once the revalidations went
// through, and only when one changed: the cron is the file's only writer.
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
// id it rendered is not the stored one, so they go through the same path
// again.

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
 * tags of the sources whose run id it rendered is not `runs`' (what the
 * run read or wrote); null: not lagging, or nothing to compare (no marks,
 * no stored digest).
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
  /** Every changed page, in order. */
  changed: string[];
  /** The first `max` of them: revalidated this run. */
  revalidate: string[];
  /** The rest: next run. */
  deferred: number;
  /** The digests to keep once `revalidate` went through. */
  next: Digests;
};

/**
 * Which pages to revalidate: those whose digest is not the stored one,
 * and, the home page lagging (`lag`, laggingTags), the home page and every
 * page reading a lagging source. A deferred page keeps its stored digest
 * (a forgotten one none), so the next run finds it changed again; a page
 * no longer listed is dropped.
 */
export function planRefresh(
  stored: Digests,
  pages: PageDigest[],
  lag: SourceTag[] | null,
  max = PREWARM_MAX,
): Plan {
  const forgotten = (page: PageDigest) =>
    lag !== null &&
    (page.path === "/" || page.sources.some((tag) => lag.includes(tag)));
  const changed = pages.filter(
    (page) => forgotten(page) || stored[page.path] !== page.digest,
  );
  const revalidate = new Set(changed.slice(0, max).map(({ path }) => path));
  const late = new Set(changed.slice(max).map(({ path }) => path));
  const next: Digests = {};
  for (const page of pages) {
    if (!late.has(page.path)) next[page.path] = page.digest;
    else if (!forgotten(page) && page.path in stored)
      next[page.path] = stored[page.path];
  }
  return {
    changed: changed.map(({ path }) => path),
    revalidate: [...revalidate],
    deferred: late.size,
    next,
  };
}

export type RefreshDeps = {
  /** Every page's digest now, home first (pageDigests). */
  pages(): Promise<PageDigest[]>;
  /** The home page's marks, read at the run's start; null: none. */
  marks: LiveMarks | null;
  /** Each live source's run id as the run read or wrote it. */
  runs: Record<string, string | null>;
  /** The digests file, from the Blob's origin; and its write. */
  read(): Promise<string | null>;
  write(body: string): Promise<void>;
  /** The wait before revalidating anything: WAIT_MS after the run's writes. */
  wait: number;
  sleep(ms: number): Promise<void>;
  /**
   * The dataset tag is to be revalidated this run (lib/dataset-sync.ts): it
   * re-renders every page, so no page tag is needed, and every digest is
   * kept as it is now.
   */
  dataset: boolean;
  revalidateTag(tag: string): void;
  prewarm(paths: string[]): Promise<{ warmed: number; failed: number }>;
  log(line: Record<string, unknown>): void;
};

/** One run's refresh (see above); logs one line, never throws. */
export async function refreshPages(deps: RefreshDeps): Promise<void> {
  try {
    const [pages, body] = await Promise.all([deps.pages(), deps.read()]);
    const stored = parseDigests(body);
    const lag = laggingTags(deps.marks, stored, deps.runs);
    if (lag) deps.log({ refresh: "home-lagging", sources: lag });
    const plan = deps.dataset
      ? {
          ...planRefresh(stored, pages, lag),
          revalidate: [],
          next: Object.fromEntries(pages.map((p) => [p.path, p.digest])),
        }
      : planRefresh(stored, pages, lag);
    if (deps.dataset || plan.revalidate.length > 0) await deps.sleep(deps.wait);
    if (deps.dataset) deps.revalidateTag(SOURCE_TAGS.dataset);
    for (const path of plan.revalidate) deps.revalidateTag(pageTag(path));
    if (JSON.stringify(plan.next) !== JSON.stringify(stored))
      await deps.write(JSON.stringify(plan.next));
    const warm = deps.dataset
      ? pages.slice(0, PREWARM_MAX).map(({ path }) => path)
      : plan.revalidate;
    const { warmed } =
      warm.length > 0 ? await deps.prewarm(warm) : { warmed: 0 };
    deps.log({
      pagesChanged: plan.changed.length,
      pagesRevalidated: plan.revalidate.length,
      prewarmed: warmed,
      deferred: deps.dataset ? 0 : plan.deferred,
      ...(deps.dataset && { dataset: "revalidated" }),
    });
  } catch (error) {
    deps.log({ refresh: "error", error: (error as Error).message });
  }
}
