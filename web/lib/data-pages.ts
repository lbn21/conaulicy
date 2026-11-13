import "server-only";
import { type PageDef, SOURCE_TAGS } from "@/lib/page-cache";
import { windowMonths } from "@/lib/pdf-key";
import { placePath } from "@/lib/places";
import { getPlace, getZone, type PlaceView, searchIndex } from "@/lib/schedule";
import { SEARCH_INDEX_PATH } from "@/lib/search";
import { ALL_PLACES } from "@/lib/static-pages";
import { calendarCuts } from "@/lib/water-ics";
import { loadWater } from "@/lib/water-load";

// The PageDefs (lib/page-cache.ts) of the lists and the files: built from
// the dataset and the live files alone, with no component imported, so a
// page that reads one (/ulice) ships no client code of the address pages'
// or the home page's. The registry of every page: lib/pages.ts.

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
