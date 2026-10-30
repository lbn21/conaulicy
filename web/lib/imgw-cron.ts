// The IMGW step of the cron (app/api/cron/zuk/route.ts, every 15 minutes):
// fetches IMGW's feed as the pages do (lib/imgw-warnings.ts upstream,
// fetchFeed), and purges the IMGW cache tag (lib/headers.ts) when what the
// pages show for the powiat changed since the last run: a warning new,
// changed or removed, one that ended (forPowiat drops it) or one that
// started (its in-force flag). Each run compares the signature of what the
// pages show at its own time with the one the last purge stored; time alone
// changes it, so no instant arithmetic. A failure is logged, purges nothing
// and keeps the stored signature: never thrown. No Next.js imports, so the
// unit tests run it as is; dependencies come in.
import { IMGW } from "./headers.ts";
import { POWIAT } from "./imgw-banner.ts";
import { type Feed, fetchFeed, forPowiat } from "./imgw-warnings.ts";

/** The private Blob file holding the last purged signature. */
export const IMGW_STATE = "imgw/shown.json";

/**
 * What the pages show for the powiat at `now`, as a string to compare: each
 * warning not yet ended, its fields and whether it is in force, by id.
 */
export function shownSignature(feed: Feed, now: number): string {
  return JSON.stringify(
    forPowiat(feed.items, POWIAT, now)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((w) => [
        w.id,
        w.level,
        w.probability,
        w.validFrom,
        w.validTo,
        w.published,
        w.text,
        w.event,
        Date.parse(w.validFrom) <= now,
      ]),
  );
}

export type ImgwCronDeps = {
  /** The feed's upstream and its fetch: lib/imgw-warnings.ts upstream(). */
  url: string;
  fetch: typeof fetch;
  /** The stored signature, or null if there is none yet. Throws if unreadable. */
  readState: () => Promise<string | null>;
  writeState: (body: string) => Promise<void>;
  /** Drops a cache tag's data cache and CDN copies: revalidateTag. */
  purge: (tag: string) => void;
  now: () => Date;
  log: (line: Record<string, unknown>) => void;
};

export type ImgwRunSummary = { changed: boolean } | { error: string };

/** One run: purges IMGW, then stores the signature, if it changed. */
export async function runImgw(deps: ImgwCronDeps): Promise<ImgwRunSummary> {
  const now = deps.now().getTime();
  let feed: Feed;
  try {
    feed = await fetchFeed(deps.url, { fetch: deps.fetch, now: () => now });
  } catch (error) {
    deps.log({ imgw: "fetch-error", error: (error as Error).message });
    return { error: "feed unavailable" };
  }
  try {
    const shown = shownSignature(feed, now);
    const changed = (await deps.readState()) !== shown;
    if (changed) {
      deps.purge(IMGW);
      await deps.writeState(shown);
    }
    deps.log({ imgw: "run", changed });
    return { changed };
  } catch (error) {
    deps.log({ imgw: "error", error: (error as Error).message });
    return { error: "failed" };
  }
}
