import "server-only";
import { type NowData, nowData } from "@/components/now-panel";
import { servedVersion } from "@/lib/dataset";
import { HOME_EXAMPLES } from "@/lib/examples";
import { type PageDef, SOURCE_TAGS } from "@/lib/page-cache";
import { examplePlaces } from "@/lib/schedule";
import type { SearchHit } from "@/lib/search";

// The home page's PageDef (lib/page-cache.ts), in a file of its own, so
// the page imports nothing of the address pages' (the registry of every
// page: lib/pages.ts).

/** What the home page renders, and each live source's run id. */
export type HomeView = {
  panel: NowData;
  examples: SearchHit[];
  /** The dataset version, for the zuk cron's sync (lib/dataset-sync.ts). */
  dataset: string;
  /** Each live source's run id (lib/live-runs.ts): no content, not hashed. */
  runs: Record<string, string | null>;
};

export const homePage: PageDef<HomeView> = {
  path: "/",
  sources: Object.values(SOURCE_TAGS),
  async load(reads) {
    const [panel, examples, dataset, runs] = await Promise.all([
      nowData(reads),
      // A few examples only: the full address list never ships to the client.
      examplePlaces(HOME_EXAMPLES),
      servedVersion(),
      reads.runs(),
    ]);
    return { panel, examples, dataset, runs };
  },
  rendered: ({ runs: _, ...view }) => view,
};
