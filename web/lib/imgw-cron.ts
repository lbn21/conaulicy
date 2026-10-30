// The IMGW step of the cron (app/api/cron/zuk/route.ts, every 15 minutes):
// fetches IMGW's feed as the pages do (lib/imgw-warnings.ts upstream,
// fetchFeed), and after every good fetch purges the IMGW cache tag
// (lib/headers.ts): the feed's cached copies and every page showing them,
// so the next view of a page renders against a fresh copy, its warnings and
// its „Sprawdziliśmy” time no older than this run. A failure (IMGW down, a
// feed of the wrong shape) is logged and purges nothing: never thrown. No
// Next.js imports, so the unit tests run it as is; dependencies come in.
import { IMGW } from "./headers.ts";
import { fetchFeed } from "./imgw-warnings.ts";

export type ImgwCronDeps = {
  /** The feed's upstream and its fetch: lib/imgw-warnings.ts upstream(). */
  url: string;
  fetch: typeof fetch;
  /** Drops a cache tag's data cache and CDN copies: revalidateTag. */
  purge: (tag: string) => void;
  log: (line: Record<string, unknown>) => void;
};

export type ImgwRunSummary = { purged: true } | { error: string };

/** One run: purges IMGW if the feed was fetched and read. */
export async function runImgw(deps: ImgwCronDeps): Promise<ImgwRunSummary> {
  try {
    await fetchFeed(deps.url, { fetch: deps.fetch });
  } catch (error) {
    deps.log({ imgw: "fetch-error", error: (error as Error).message });
    return { error: "feed unavailable" };
  }
  deps.purge(IMGW);
  deps.log({ imgw: "run", purged: true });
  return { purged: true };
}
