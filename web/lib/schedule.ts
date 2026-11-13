import "server-only";
import { getDataset } from "@/lib/dataset";
import {
  examplePlacesOf,
  type PlaceView,
  placeIdsOf,
  placeView,
  searchIndexOf,
  wasteWeekOf,
  zoneView,
} from "@/lib/dataset-views";
import { todayInWarsaw } from "@/lib/dates";
import type { SearchHit } from "@/lib/search";

// The pages' reads of places and dates, all from the dataset snapshot
// (lib/dataset.ts), never the database: every page that reads one is
// cached under the dataset tag (lib/page-cache.ts), which an import's POST
// /api/revalidate and the day's first cron run purge; what depends on the
// day is worked out here per call (lib/dataset-views.ts), never kept per
// place or day.

export type {
  Pickup,
  PickupDay,
  PlaceView,
  SourceView,
} from "@/lib/dataset-views";

/** A place's view for today in Warsaw; null: no such place. */
export async function getPlace(id: string): Promise<PlaceView | null> {
  // Event dates are ISO days in Europe/Warsaw, so compare against the Warsaw day, not UTC.
  return placeView(await getDataset(), id, todayInWarsaw());
}

/** A zone with its gmina and upcoming events (its ICS feed). */
export async function getZone(zoneId: string) {
  return zoneView(await getDataset(), zoneId, todayInWarsaw());
}

/** The home page's panel: lib/dataset-views.ts wasteWeekOf. */
export async function wasteWeek(from: string, until: string) {
  return wasteWeekOf(await getDataset(), from, until);
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
