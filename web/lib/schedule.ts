import "server-only";
import { getDataset } from "@/lib/dataset";
import {
  examplePlacesOf,
  type PlaceView,
  placeIdsOf,
  placeView,
  searchIndexOf,
  wasteWindowOf,
  zoneView,
} from "@/lib/dataset-views";
import { todayInWarsaw } from "@/lib/dates";
import type { SearchHit } from "@/lib/search";

// The pages' reads of places and dates, all from the dataset snapshot
// (lib/dataset.ts), never the database: every page that reads one is
// cached under the dataset tag (lib/page-cache.ts), which an import's POST
// /api/revalidate purges; what depends on the day is worked out here per
// call, for the reads' clock (lib/dataset-views.ts), never kept per place
// or day: the zuk cron re-renders a page whose day words moved
// (lib/page-refresh.ts).

export type {
  Pickup,
  PickupDay,
  PlaceView,
  SourceView,
} from "@/lib/dataset-views";

/** A place's view for the Warsaw day of `now` (ms); null: no such place. */
export async function getPlace(
  id: string,
  now: number,
): Promise<PlaceView | null> {
  // Event dates are ISO days in Europe/Warsaw, so compare against the Warsaw day, not UTC.
  return placeView(await getDataset(), id, todayInWarsaw(new Date(now)));
}

/** A zone with its gmina and its events from the Warsaw day of `now` on. */
export async function getZone(zoneId: string, now: number) {
  return zoneView(await getDataset(), zoneId, todayInWarsaw(new Date(now)));
}

/** The home page's panel: lib/dataset-views.ts wasteWindowOf. */
export async function wasteInWindow(from: string, until: string) {
  return wasteWindowOf(await getDataset(), from, until);
}

/**
 * Every place search can find, as [id, label, type], so the search field
 * matches on the device with no request per keystroke; /ulice's list and
 * the places without pickup data (lib/dataset-views.ts searchIndexOf).
 */
export async function searchIndex() {
  return searchIndexOf(await getDataset());
}

/**
 * Every current place's id, listed or not (a roundabout's too), as the
 * address routes' generateStaticParams: only these pages exist
 * (dynamicParams = false), every other id is the prerendered 404.
 */
export async function placeParams(): Promise<Array<{ id: string }>> {
  return placeIdsOf(await getDataset()).map((id) => ({ id }));
}

/** Every waste zone's id, as /ics/[zoneId]'s generateStaticParams. */
export async function zoneParams(): Promise<Array<{ zoneId: string }>> {
  return (await getDataset()).zones
    .filter((z) => z.type === "waste")
    .map((z) => ({ zoneId: z.id }));
}

/** The home page's examples (lib/examples.ts), by their own names. */
export async function examplePlaces(ids: string[]): Promise<SearchHit[]> {
  return examplePlacesOf(await getDataset(), ids);
}
