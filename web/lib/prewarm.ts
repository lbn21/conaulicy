// After a revalidation ("max": stale served at once, the new page rendered
// in the background on the next request), one GET per changed page makes
// that request ours, not a visitor's: the visitor then gets the new page.
// Every page given, in its order (the home page first), CONCURRENCY at
// once, each given TIMEOUT_MS. No count limit: only time. A GET starts
// only while it can end by `until` (the function's end less END_MARGIN_MS);
// the pages it could not start are counted as skipped, rendered on their
// next visit. Failures are counted, never thrown.
//
// A GET answered from the CDN's cache (`x-vercel-cache: HIT`) with a page
// rendered before `since` (the revalidation; its `age`) is the old page:
// the purge has not arrived yet, so nothing was rendered. Its path goes
// back to the end of the queue, tried again RETRY_MS later, as long as
// `until` allows; what is still the old page at the end is notPurged. A
// HIT rendered since the revalidation (a visitor's request rendered it) is
// warmed, as is every other answer that is not a HIT (STALE, MISS,
// PRERENDER, REVALIDATED; none outside Vercel's CDN).

const CONCURRENCY = 8;
const TIMEOUT_MS = 10_000;

/** The wait before a path whose purge had not arrived is tried again. */
export const RETRY_MS = 1_000;

/** Left at the function's end for the run's log line after the GETs. */
export const END_MARGIN_MS = 5_000;

/** When a function started at `start` with `maxDuration` (s) must be done warming. */
export const warmUntil = (start: number, maxDuration: number) =>
  start + maxDuration * 1000 - END_MARGIN_MS;

export type Prewarmed = {
  warmed: number;
  failed: number;
  /** Never fetched in the function's time. */
  skipped: number;
  /** Fetched, but still the page from before the revalidation. */
  notPurged: number;
};

/**
 * Whether `response`, read at `now`, is the page from before `since`: a
 * HIT, its age in whole seconds (truncated: rendered up to 1 s earlier
 * than it says), so taken as rendered at now - (age + 1) s, the earliest
 * it can have been; old if that is before `since`. A HIT without an age:
 * old.
 */
export function oldPage(response: Response, since: number, now: number) {
  if (response.headers.get("x-vercel-cache") !== "HIT") return false;
  const age = response.headers.get("age");
  if (age === null || !Number.isFinite(Number(age))) return true;
  return now - (Number(age) + 1) * 1000 < since;
}

export async function prewarm(
  origin: string,
  paths: string[],
  {
    until = Number.POSITIVE_INFINITY,
    since,
    fetcher = fetch,
    now = Date.now,
    sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  }: {
    until?: number;
    /** When the paths were revalidated; default: the call. */
    since?: number;
    fetcher?: typeof fetch;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<Prewarmed> {
  const revalidated = since ?? now();
  // Each path, and when it may be fetched (again); `old`: it was the old page.
  const queue = [...new Set(paths)].map((path) => ({
    path,
    at: 0,
    old: false,
  }));
  let warmed = 0;
  let failed = 0;
  const worker = async () => {
    while (queue.length > 0) {
      const t = now();
      if (t + TIMEOUT_MS > until) return;
      const next = queue.findIndex((item) => item.at <= t);
      if (next === -1) {
        const soonest = Math.min(...queue.map((item) => item.at));
        if (soonest + TIMEOUT_MS > until) return;
        await sleep(soonest - t);
        continue;
      }
      const [item] = queue.splice(next, 1);
      try {
        const response = await fetcher(new URL(item.path, origin), {
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        await response.arrayBuffer();
        if (!response.ok) failed++;
        else if (oldPage(response, revalidated, now()))
          queue.push({ path: item.path, at: now() + RETRY_MS, old: true });
        else warmed++;
      } catch {
        failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const notPurged = queue.filter((item) => item.old).length;
  return { warmed, failed, skipped: queue.length - notPurged, notPurged };
}
