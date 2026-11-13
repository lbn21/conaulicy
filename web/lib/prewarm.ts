// After a revalidation ("max": stale served at once, the new page rendered
// in the background on the next request), one GET per changed page makes
// that request ours, not a visitor's: the visitor then gets the new page.
// The home page first; at most PREWARM_MAX per run (the rest are rendered on their
// next visit); CONCURRENCY at once, each given TIMEOUT_MS. Failures are
// counted, never thrown.

export const PREWARM_MAX = 400;
const CONCURRENCY = 8;
const TIMEOUT_MS = 10_000;

export async function prewarm(
  origin: string,
  paths: string[],
  fetcher: typeof fetch = fetch,
): Promise<{ warmed: number; failed: number }> {
  const queue = [...new Set(paths)].slice(0, PREWARM_MAX);
  let warmed = 0;
  let failed = 0;
  const worker = async () => {
    for (let path = queue.shift(); path !== undefined; path = queue.shift()) {
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
  return { warmed, failed };
}
