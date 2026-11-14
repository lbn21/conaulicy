// One live feed's step of the cron (app/api/cron/zuk/route.ts, every 15
// minutes; lib/zuk-cron.ts handleZukCron runs every step): fetch the
// upstream, keep only our items, write the store's file (lib/live-store.ts)
// only when those items changed. The pages read that file, never the
// upstream. A failure (the upstream down, a body of the wrong shape, the
// file not written) is logged and leaves the file as it was: never thrown.
// The step's result is the check's (status/checks.json, lib/live-status.ts).
// IMGW (lib/imgw-cron.ts) and PGE (lib/pge-cron.ts) are such steps. No
// Next.js imports, so the unit tests run it as is; dependencies come in.
import "server-only";

/** checked: the feed was fetched and read, and the file holds it. */
export type LiveRunSummary =
  | { checked: true; changed: boolean }
  | { error: string };

/** A feed as its file keeps it: when it was fetched, our items. */
type LiveFeed = { fetchedAt: string; items: unknown[] };

/**
 * A fetch that failed in a known way: `kind` is the log's class
 * ("auth-error", "rate-limited"); any other error logs as "fetch-error".
 */
export class FetchFailure extends Error {
  constructor(
    readonly kind: string,
    message: string,
  ) {
    super(message);
  }
}

export type LiveFeedStep<F extends LiveFeed> = {
  /** The log lines' key and the checks' key: "imgw", "pge". */
  name: string;
  /** The upstream's feed, only our items. Throws when it is unavailable. */
  fetch: () => Promise<F>;
  /** The file's body, or null if there is none yet. Throws if unreadable. */
  read: () => Promise<string | null>;
  write: (body: string) => Promise<void>;
  /** The file's feed, or null for none; throws on a body that is not one. */
  parse: (body: string | null) => F | null;
  /** The file's body for a feed. */
  serialise: (feed: F) => string;
  /** More of the good run's log line (PGE's tries); none by default. */
  details?: () => Record<string, unknown>;
  log: (line: Record<string, unknown>) => void;
};

const sameItems = (a: LiveFeed, b: LiveFeed) =>
  JSON.stringify(a.items) === JSON.stringify(b.items);

/** One run: fetches the feed, writes the file if our items changed. */
export async function runLiveFeed<F extends LiveFeed>(
  step: LiveFeedStep<F>,
): Promise<LiveRunSummary> {
  const { name, log } = step;
  let feed: F;
  try {
    feed = await step.fetch();
  } catch (error) {
    const kind = error instanceof FetchFailure ? error.kind : "fetch-error";
    log({ [name]: kind, error: (error as Error).message });
    return { error: "feed unavailable" };
  }
  // A file that cannot be read, or is not one: written afresh.
  let previous: F | null = null;
  try {
    previous = step.parse(await step.read());
  } catch (error) {
    log({ [name]: "feed-unreadable", error: (error as Error).message });
  }
  const changed = !previous || !sameItems(previous, feed);
  if (changed) {
    try {
      await step.write(step.serialise(feed));
    } catch (error) {
      log({ [name]: "write-error", error: (error as Error).message });
      return { error: "feed not written" };
    }
  }
  log({
    [name]: "run",
    changed,
    items: feed.items.length,
    ...step.details?.(),
  });
  return { checked: true, changed };
}
