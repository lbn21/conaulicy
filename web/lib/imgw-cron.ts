// The IMGW step of the cron (app/api/cron/zuk/route.ts, every 15 minutes),
// the one place that asks IMGW (lib/imgw-warnings.ts upstream, fetchFeed):
// after a good fetch, the feed's items for our powiats go to the store's
// feed file (imgw/feed.json, lib/live-store.ts), only when they changed
// (lib/live-cron.ts runLiveFeed, as every live feed). The pages read that
// file, never IMGW. A failure is logged and leaves the file as it was:
// never thrown. The run's result is the check's: the cron records it
// (status/checks.json; lib/zuk-cron.ts handleZukCron); nothing is purged,
// the pages read the files per request. No Next.js imports, so the unit
// tests run it as is; dependencies come in.
import "server-only";
import { feedFile, fetchFeed, ours, parseFeedFile } from "./imgw-warnings.ts";
import { type LiveRunSummary, runLiveFeed } from "./live-cron.ts";

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

/** One run: fetches the feed, writes the file if our items changed. */
export function runImgw(deps: ImgwCronDeps): Promise<LiveRunSummary> {
  return runLiveFeed({
    name: "imgw",
    fetch: async () => {
      const fetched = await fetchFeed(deps.url, {
        fetch: deps.fetch,
        now: deps.now,
      });
      return { fetchedAt: fetched.fetchedAt, items: ours(fetched.items) };
    },
    read: deps.readFeed,
    write: deps.writeFeed,
    parse: parseFeedFile,
    serialise: feedFile,
    log: deps.log,
  });
}
