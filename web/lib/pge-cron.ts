// The PGE step of the cron (app/api/cron/zuk/route.ts, every 15 minutes),
// the one place that asks PGE (lib/pge-feed.ts upstream, fetchOutages):
// one request a run, no retries (PGE allows 60 an hour). After a good
// fetch, our area's outages go to the store's file (pge/outages.json,
// lib/live-store.ts), only when they changed (lib/live-cron.ts
// runLiveFeed, as IMGW's). A failure is logged by its class (auth-error,
// rate-limited, fetch-error) and leaves the file as it was. The run's
// result is the check's (status/checks.json, PGE_KEY). docs/data/pge.md.
import "server-only";
import { type LiveRunSummary, runLiveFeed } from "./live-cron.ts";
import {
  fetchOutages,
  ours,
  outagesFile,
  parseOutagesFile,
} from "./pge-feed.ts";
import type { ZukPlaces } from "./zuk-resolve.ts";

export type PgeCronDeps = {
  /** The list's URL, its fetch and the token: lib/pge-feed.ts upstream(). */
  url: string;
  fetch: typeof fetch;
  token: string | undefined;
  /** Our localities and streets (TERYT): lib/zuk-places.generated.ts. */
  places: Pick<ZukPlaces, "localities" | "streets">;
  /** The file's body, or null if there is none yet. Throws if unreadable. */
  readFile: () => Promise<string | null>;
  writeFile: (body: string) => Promise<void>;
  /** The clock (ms): the copy's fetchedAt. Date.now by default. */
  now?: () => number;
  log: (line: Record<string, unknown>) => void;
};

/** One run: fetches the list, writes the file if our outages changed. */
export function runPge(deps: PgeCronDeps): Promise<LiveRunSummary> {
  return runLiveFeed({
    name: "pge",
    fetch: async () => {
      const fetched = await fetchOutages(deps.url, deps);
      return {
        fetchedAt: fetched.fetchedAt,
        items: ours(fetched.items, deps.places, deps.log),
      };
    },
    read: deps.readFile,
    write: deps.writeFile,
    parse: parseOutagesFile,
    serialise: outagesFile,
    log: deps.log,
  });
}
