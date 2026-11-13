import "server-only";
import { type NowData, nowData } from "@/components/now-panel";
import { SUBPAGE_IDS } from "@/lib/address-routes";
import { servedVersion } from "@/lib/dataset";
import { HOME_EXAMPLES } from "@/lib/examples";
import { MODULE_IDS, type SubpageId } from "@/lib/module-ids";
import { MODULES, type Module } from "@/lib/modules";
import { type PageDef, SOURCE_TAGS } from "@/lib/page-cache";
import { windowMonths } from "@/lib/pdf-key";
import { placePath } from "@/lib/places";
import {
  examplePlaces,
  getPlace,
  getZone,
  type PlaceView,
  placeParams,
  searchIndex,
  zoneParams,
} from "@/lib/schedule";
import { SEARCH_INDEX_PATH, type SearchHit } from "@/lib/search";
import { ALL_PLACES } from "@/lib/static-pages";
import { calendarCuts } from "@/lib/water-ics";
import { loadWater } from "@/lib/water-load";

// Every prerendered page and file whose data can change, one PageDef each
// (lib/page-cache.ts): the pages read their view through it (pageData),
// and the zuk cron reads every one's view the same way for its digest
// (lib/page-refresh.ts, allPages), so a page is re-rendered when what it
// renders changes, and only then.

const ALL = Object.values(SOURCE_TAGS);

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
  sources: ALL,
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

export const allPlacesPage = {
  path: ALL_PLACES.path,
  sources: [SOURCE_TAGS.dataset],
  load: async () => (await searchIndex()).list,
} satisfies PageDef<unknown>;

export const sitemapPage = {
  path: "/sitemap.xml",
  sources: [SOURCE_TAGS.dataset],
  async load() {
    const { places, noData } = await searchIndex();
    return { places, noData };
  },
} satisfies PageDef<unknown>;

export const searchIndexPage = {
  path: SEARCH_INDEX_PATH,
  sources: [SOURCE_TAGS.dataset],
  load: async () => (await searchIndex()).places,
} satisfies PageDef<unknown>;

const MODULE_LIST = MODULE_IDS.map((slug): Module<unknown> => MODULES[slug]);

/**
 * The address page: every module's data, in registry order (the first,
 * waste's, is the place itself); null: no such place.
 */
export function hubPage(id: string): PageDef<unknown[] | null> {
  return {
    path: placePath(id),
    sources: [...new Set(MODULE_LIST.flatMap((module) => module.tags))],
    async load(reads) {
      const data = await Promise.all(
        MODULE_LIST.map((module) => module.load(id, reads)),
      );
      return data[0] === null ? null : data;
    },
  };
}

/** A module's subpage: the place and the module's data; null: no place. */
export function subpage(
  id: string,
  slug: SubpageId,
): PageDef<{ place: PlaceView; data: unknown } | null> {
  const module = MODULES[slug] as Module<unknown>;
  return {
    path: `${placePath(id)}/${slug}`,
    sources: [...new Set([SOURCE_TAGS.dataset, ...module.tags])],
    async load(reads) {
      const [place, data] = await Promise.all([
        getPlace(id, reads.now),
        module.load(id, reads),
      ]);
      return place ? { place, data } : null;
    },
  };
}

/**
 * The waste PDF: the place; it prints the months from today's on, not the
 * day, so its digest takes the months instead of the day.
 */
export function pdfPage(id: string): PageDef<PlaceView | null> {
  return {
    path: `${placePath(id)}/harmonogram.pdf`,
    sources: [SOURCE_TAGS.dataset],
    load: (reads) => getPlace(id, reads.now),
    rendered: (place) =>
      place && {
        ...place,
        today: undefined,
        months: windowMonths(place.today),
      },
  };
}

/**
 * The water calendar: /woda's data; it holds the cuts and the place's name,
 * so its digest takes those, not the day or the waste days.
 */
export function waterIcsPage(
  id: string,
): PageDef<Awaited<ReturnType<typeof loadWater>>> {
  return {
    path: `${placePath(id)}/woda.ics`,
    sources: [SOURCE_TAGS.dataset, SOURCE_TAGS.water],
    load: (reads) => loadWater(id, reads),
    rendered: (data) =>
      data && {
        cuts: calendarCuts(data),
        place: { ...data.place, today: undefined, days: undefined },
      },
  };
}

/** A waste zone's calendar, by its id, its path encoded. */
export function zoneIcsPage(
  zoneId: string,
): PageDef<Awaited<ReturnType<typeof getZone>>> {
  return {
    path: `/ics/${encodeURIComponent(zoneId)}`,
    sources: [SOURCE_TAGS.dataset],
    load: (reads) => getZone(zoneId, reads.now),
  };
}

/**
 * Every page and file of the dataset this deployment serves, in the order
 * the cron refreshes them: the home page first, then the address pages,
 * their subpages, the lists and the files.
 */
export async function allPages(): Promise<PageDef<unknown>[]> {
  const ids = (await placeParams()).map(({ id }) => id);
  const zones = (await zoneParams()).map(({ zoneId }) => zoneId);
  return [
    homePage,
    ...ids.map(hubPage),
    ...SUBPAGE_IDS.flatMap((slug) =>
      ids.map((id) => subpage(id, slug as SubpageId)),
    ),
    allPlacesPage,
    sitemapPage,
    searchIndexPage,
    ...ids.map(pdfPage),
    ...ids.map(waterIcsPage),
    ...zones.map(zoneIcsPage),
  ] as PageDef<unknown>[];
}
