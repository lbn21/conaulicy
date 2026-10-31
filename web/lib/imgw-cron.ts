// The IMGW step of the cron (app/api/cron/zuk/route.ts, every 15 minutes),
// the one place that asks IMGW (lib/imgw-warnings.ts upstream, fetchFeed):
// after a good fetch, the feed's items for our powiats go to the store's
// feed file (imgw/feed.json, lib/live-store.ts), only when they changed.
// The pages read that file, never IMGW. A failure (IMGW down, a feed of
// the wrong shape, the file not written) is logged and leaves the file as
// it was: never thrown. The run's result is the check's: the cron records
// it (status/checks.json) and purges IMGW after a good one
// (lib/zuk-cron.ts handleZukCron). No Next.js imports, so the unit tests
// run it as is; dependencies come in.
import {
  type Feed,
  feedFile,
  fetchFeed,
  ours,
  parseFeedFile,
} from "./imgw-warnings.ts";

export type ImgwCronDeps = {
  /** The feed's upstream and its fetch: lib/imgw-warnings.ts upstream(). */
  url: string;
  fetch: typeof fetch;
  /** The feed file's body, or null if there is none yet. Throws if unreadable. */
  readFeed: () => Promise<string | null>;
  writeFeed: (body: string) => Promise<void>;
  /** The clock (ms): the copy's fetchedAt. Date.now by default. */
  now?: () => number;
  log: (line: Record<string, unknown>) => void;
};

/** checked: the feed was fetched and read, and the file holds it. */
export type ImgwRunSummary =
  | { checked: true; changed: boolean }
  | { error: string };

const sameItems = (a: Feed, b: Feed) =>
  JSON.stringify(a.items) === JSON.stringify(b.items);

/** One run: fetches the feed, writes the file if our items changed. */
export async function runImgw(deps: ImgwCronDeps): Promise<ImgwRunSummary> {
  let fetched: Feed;
  try {
    fetched = await fetchFeed(deps.url, { fetch: deps.fetch, now: deps.now });
  } catch (error) {
    deps.log({ imgw: "fetch-error", error: (error as Error).message });
    return { error: "feed unavailable" };
  }
  const feed = { fetchedAt: fetched.fetchedAt, items: ours(fetched.items) };
  // A file that cannot be read, or is not one: written afresh.
  let previous: Feed | null = null;
  try {
    previous = parseFeedFile(await deps.readFeed());
  } catch (error) {
    deps.log({ imgw: "feed-unreadable", error: (error as Error).message });
  }
  const changed = !previous || !sameItems(previous, feed);
  if (changed) {
    try {
      await deps.writeFeed(feedFile(feed));
    } catch (error) {
      deps.log({ imgw: "write-error", error: (error as Error).message });
      return { error: "feed not written" };
    }
  }
  deps.log({ imgw: "run", changed, items: feed.items.length });
  return { checked: true, changed };
}
