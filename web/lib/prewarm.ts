// After a revalidation ("max": stale served at once, the new page rendered
// in the background on the next request), one GET per changed page makes
// that request ours, not a visitor's: the visitor then gets the new page.
// Every page given, in its order (the home page first), CONCURRENCY at
// once, each given TIMEOUT_MS. No count limit: only time. A GET starts
// only while it can end by `until` (the function's end less END_MARGIN_MS);
// the pages it could not start are counted as skipped, rendered on their
// next visit. Failures are counted, never thrown.

const CONCURRENCY = 8;
const TIMEOUT_MS = 10_000;

/** Left at the function's end for the run's log line after the GETs. */
export const END_MARGIN_MS = 5_000;

/** When a function started at `start` with `maxDuration` (s) must be done warming. */
export const warmUntil = (start: number, maxDuration: number) =>
  start + maxDuration * 1000 - END_MARGIN_MS;

export type Prewarmed = { warmed: number; failed: number; skipped: number };

export async function prewarm(
  origin: string,
  paths: string[],
  {
    until = Number.POSITIVE_INFINITY,
    fetcher = fetch,
    now = Date.now,
  }: { until?: number; fetcher?: typeof fetch; now?: () => number } = {},
): Promise<Prewarmed> {
  const queue = [...new Set(paths)];
  let warmed = 0;
  let failed = 0;
  const worker = async () => {
    while (queue.length > 0 && now() + TIMEOUT_MS <= until) {
      const path = queue.shift() as string;
      try {
        const response = await fetcher(new URL(path, origin), {
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        await response.arrayBuffer();
        if (response.ok) warmed++;
        else failed++;
      } catch {
        failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return { warmed, failed, skipped: queue.length };
}
