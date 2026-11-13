import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { getDataset } from "@/lib/dataset";
import {
  examplePlacesOf,
  type PlaceView,
  placeIdsOf,
  placeView,
  retiredPlaceOf,
  searchIndexOf,
  wasteWeekOf,
  zoneView,
} from "@/lib/dataset-views";
import { todayInWarsaw } from "@/lib/dates";
import { DATASET, LIVE } from "@/lib/headers";
import { houseNumber } from "@/lib/house";
import { movedPath } from "@/lib/places";
import { isValidHouseNumber } from "@/lib/prg";
import { type Matcher, matcher, type SearchHit } from "@/lib/search";

// The pages' reads of places and dates, all from the dataset snapshot
// (lib/dataset.ts), never the database: the snapshot is cached as the pages
// are, under the dataset tag, which an import's POST /api/revalidate
// purges; what depends on the day or a house number is worked out here per
// call (lib/dataset-views.ts), never kept per place, day or number.

/** getPlace's and getZone's tags: a cached page reading one carries them. */
export const PLACE_TAGS = [DATASET];

export type {
  Pickup,
  PickupDay,
  PlaceView,
  SourceView,
} from "@/lib/dataset-views";

/**
 * nr: a house number as given (?nr=). One the register lacks at the place
 * (lib/prg.ts isValidHouseNumber) is set aside, as invalidNr; anything else
 * invalid is ignored.
 */
export async function getPlace(
  id: string,
  nr?: string | null,
): Promise<PlaceView | null> {
  const valid = nr ? isValidHouseNumber(id, nr) : null;
  // Event dates are ISO days in Europe/Warsaw, so compare against the Warsaw day, not UTC.
  const view = placeView(
    await getDataset(),
    id,
    valid === false ? null : houseNumber(nr),
    todayInWarsaw(),
  );
  if (!view) return null;
  return {
    ...view,
    invalidNr: valid === false ? (nr ?? null) : null,
    knownNr: valid === true && view.givenNr !== null,
  };
}

/** A zone with its gmina and upcoming events (its ICS feed). */
export async function getZone(zoneId: string) {
  return zoneView(await getDataset(), zoneId, todayInWarsaw());
}

/**
 * The home page's panel: lib/dataset-views.ts wasteWeekOf. Cached as
 * "live", as the panel's other reads (next.config.ts).
 */
export async function wasteWeek(from: string, until: string) {
  "use cache";
  cacheLife("live");
  cacheTag(LIVE);
  return wasteWeekOf(await getDataset(), from, until);
}

/**
 * Every place search can find, as [id, label, type], so the search field
 * matches on the device with no request per keystroke; its version, /ulice's
 * list and the places without pickup data (lib/dataset-views.ts
 * searchIndexOf).
 */
export async function searchIndex() {
  return searchIndexOf(await getDataset());
}

// The matcher for the current index, prepared once per index version.
let prepared: { version: string; match: Matcher } | null = null;

/**
 * At most 8 places for q, ranked as the search field ranks them (the same
 * matcher over the same index). The fallback when the field cannot load
 * the index.
 */
export async function search(q: string): Promise<SearchHit[]> {
  const { version, places } = await searchIndex();
  if (prepared?.version !== version) {
    prepared = { version, match: matcher(places) };
  }
  return prepared.match(q).hits;
}

/** Renamed places: old id → new id (reviewed renames only). */
export async function movedPlaces(): Promise<Record<string, string>> {
  return (await getDataset()).redirects;
}

/**
 * Every place's id, listed or not, retired ones too: for proxy.ts's 404
 * of an unknown address (/api/places).
 */
export async function placeIds(): Promise<string[]> {
  return placeIdsOf(await getDataset());
}

/** A place TERYT no longer lists and nothing replaced, or null. */
export async function retiredPlace(id: string) {
  return retiredPlaceOf(await getDataset(), id);
}

/**
 * Where a renamed place's old address `path` (as asked for) now lives, or
 * null: not renamed. For an id with no place of its own (getPlace null).
 */
export async function movedTarget(
  id: string,
  path: string,
): Promise<string | null> {
  const to = (await movedPlaces())[id] ?? null;
  return to && movedPath(path, id, to);
}

/** Where the search field loads the current index from. */
export async function searchIndexUrl(): Promise<string> {
  const { version } = await searchIndex();
  return `/api/search-index/${version}`;
}

/** The home page's examples (lib/examples.ts), by their own names. */
export async function examplePlaces(ids: string[]): Promise<SearchHit[]> {
  return examplePlacesOf(await getDataset(), ids);
}
