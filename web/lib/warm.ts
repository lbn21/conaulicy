// After the cron purged cache tags (app/api/cron/zuk/route.ts), the pages
// carrying them are rebuilt at once, so the next resident gets a fresh,
// fast page instead of waiting for its render: every page in the route map
// (lib/site-pages.ts, the sitemap's) that carries a purged tag, each once,
// at most CONCURRENCY at a time. A page is started only with its whole
// timeout and a margin left before the deadline; the rest is left for ISR.
// A failure is logged (its path: ids only) and never retried or thrown. No
// tag purged, nothing warmed. No Next.js imports: dependencies come in.
import type { SitePage } from "./site-pages.ts";

const CONCURRENCY = 4;
/** One page's render, at most. */
export const WARM_TIMEOUT_MS = 20_000;
/** Left before the deadline once the last page could end. */
export const WARM_MARGIN_MS = 15_000;

export type WarmDeps = {
  fetch: typeof fetch;
  /** The site's origin, e.g. SITE_URL. */
  base: string;
  /** The route map's pages (lib/site-pages.ts sitePages). */
  pages: () => Promise<SitePage[]>;
  now: () => Date;
  /** When the function is stopped. None: no time limit. */
  deadline?: Date;
  log: (line: Record<string, unknown>) => void;
};

export type WarmSummary = {
  pages: number;
  warmed: number;
  failed: number;
  /** Not started before the deadline: left for ISR. */
  left: number;
};

/** Every page carrying one of `tags`, fetched once; never throws. */
export async function warm(
  tags: Iterable<string>,
  deps: WarmDeps,
): Promise<WarmSummary | null> {
  const purged = new Set(tags);
  if (purged.size === 0) return null;
  let pages: SitePage[];
  try {
    pages = await deps.pages();
  } catch (error) {
    deps.log({ warm: "error", error: (error as Error).message });
    return null;
  }
  const paths = [
    ...new Set(
      pages
        .filter((page) => page.tags.some((tag) => purged.has(tag)))
        .map((page) => page.path),
    ),
  ];
  const summary: WarmSummary = {
    pages: paths.length,
    warmed: 0,
    failed: 0,
    left: 0,
  };
  const inTime = () =>
    !deps.deadline ||
    deps.deadline.getTime() - deps.now().getTime() >=
      WARM_TIMEOUT_MS + WARM_MARGIN_MS;
  let next = 0;
  const worker = async () => {
    while (next < paths.length && inTime()) {
      const path = paths[next++];
      try {
        const response = await deps.fetch(new URL(path, deps.base), {
          signal: AbortSignal.timeout(WARM_TIMEOUT_MS),
          cache: "no-store",
        });
        await response.arrayBuffer();
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        summary.warmed++;
      } catch (error) {
        summary.failed++;
        deps.log({ warm: "failed", path, error: (error as Error).message });
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  summary.left = paths.length - next;
  deps.log({ warm: "run", tags: [...purged].sort(), ...summary });
  return summary;
}
