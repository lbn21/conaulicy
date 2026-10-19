import "server-only";
import { createHash } from "node:crypto";
import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNull,
  like,
  notExists,
  notInArray,
  or,
  type SQL,
} from "drizzle-orm";
import { type AnyPgColumn, alias } from "drizzle-orm/pg-core";
import { unstable_cache } from "next/cache";
import { todayInWarsaw } from "@/lib/dates";
import {
  db,
  events,
  gminy,
  localities,
  streets,
  zoneMembers,
  zones,
} from "@/lib/db";
import { houseNumber, readings } from "@/lib/house";
import {
  gminaShortName,
  isSplitStreet,
  pickZone,
  streetLabel,
  streetName,
  UNLISTED_PREFIXES,
  villageLabel,
} from "@/lib/places";
import {
  byLabel,
  SEARCH_LIMIT,
  type SearchHit,
  type SearchIndex,
  searchTerms,
} from "@/lib/search";

// Every read goes through Next's data cache, tagged DATASET: a traffic spike
// hits the cache, not Neon. After an import, POST /api/revalidate purges the
// tag. The hourly revalidate is only a safety net.
export const DATASET = "dataset";
const CACHE = { tags: [DATASET], revalidate: 3600 };

export type ZoneEvent = typeof events.$inferSelect;

type Place = {
  id: string;
  kind: "ulica" | "wies";
  name: string;
  label: string;
  area: string;
  gmina: string;
  schedulePage: string | null;
  localityId: string;
  /** The village of a village part. */
  parentId: string | null;
  streetId?: string;
};

export type Pickup = {
  id: string;
  subtype: string;
  label: string;
  putOutBy: string | null;
  /** Originally scheduled ISO date when the pickup was moved (e.g. a holiday). */
  shiftedFrom: string | null;
};

export type PickupDay = { date: string; pickups: Pickup[] };

export type SourceView = {
  /** Human label, e.g. "Sektor 1, październik–grudzień 2026". */
  label: string;
  url: string | null;
  checkedAt: string | null;
};

export type PlaceView = {
  id: string;
  kind: Place["kind"];
  name: string;
  label: string;
  area: string;
  /** Gmina name as in TERYT, e.g. "Lubaczów (miasto)". */
  gmina: string;
  zoneId: string | null;
  /** The house number this view is for, shown after the name. */
  nr: string | null;
  /** A street split by house numbers, and no number that picks its zone. */
  askNumber: boolean;
  /** The number given on a split street when no part of it has that number. */
  unknownNr: string | null;
  /** Warsaw day this view was computed for; the page renders "dziś"/"jutro" from it. */
  today: string;
  schedulePage: string | null;
  days: PickupDay[];
  sources: SourceView[];
  verified: boolean;
};

const SUBTYPE_ORDER = [
  "zmieszane",
  "zmieszane_i_bio",
  "popiol",
  "bio",
  "papier",
  "tworzywa",
  "tworzywa_metale",
  "szklo",
  "wielkogabarytowe",
  "elektro",
  "opony",
  "tekstylia",
];

const matchAll = (column: AnyPgColumn, terms: string[]) =>
  and(...terms.map((term) => like(column, `%${term}%`)));

// A locality is a place of its own only when it has no streets (a village);
// otherwise its streets are the places.
const withoutStreets = () =>
  notExists(
    db()
      .select({ id: streets.id })
      .from(streets)
      .where(eq(streets.localityId, localities.id)),
  );

// Roundabouts and squares stay out of search and the examples.
const listed = notInArray(streets.prefix, UNLISTED_PREFIXES);

const parent = alias(localities, "parent");

const streetPlaces = (where: SQL | undefined, limit: number) =>
  db()
    .select({
      id: streets.id,
      prefix: streets.prefix,
      name: streets.name,
      localityId: streets.localityId,
      parentId: localities.parentId,
      locality: localities.name,
      gmina: gminy.name,
      scheduleUrl: gminy.scheduleUrl,
    })
    .from(streets)
    .innerJoin(localities, eq(localities.id, streets.localityId))
    .innerJoin(gminy, eq(gminy.id, localities.gminaId))
    .where(where)
    .orderBy(asc(streets.search))
    .limit(limit);

const villagePlaces = (where: SQL | undefined, limit: number) =>
  db()
    .select({
      id: localities.id,
      name: localities.name,
      parentId: localities.parentId,
      parent: parent.name,
      gmina: gminy.name,
      scheduleUrl: gminy.scheduleUrl,
    })
    .from(localities)
    .innerJoin(gminy, eq(gminy.id, localities.gminaId))
    .leftJoin(parent, eq(parent.id, localities.parentId))
    .where(and(withoutStreets(), where))
    .orderBy(asc(localities.search))
    .limit(limit);

type StreetRow = Awaited<ReturnType<typeof streetPlaces>>[number];
type VillageRow = Awaited<ReturnType<typeof villagePlaces>>[number];

function streetPlace(row: StreetRow): Place {
  return {
    id: row.id,
    kind: "ulica",
    name: streetName(row.prefix, row.name),
    label: streetLabel(row),
    area: row.locality,
    gmina: row.gmina,
    schedulePage: row.scheduleUrl,
    localityId: row.localityId,
    parentId: row.parentId,
    streetId: row.id,
  };
}

function villagePlace(row: VillageRow): Place {
  const gmina = gminaShortName(row.gmina);
  return {
    id: row.id,
    kind: "wies",
    name: row.name,
    label: villageLabel(row),
    area: row.parent ? `${row.parent}, gmina ${gmina}` : `gmina ${gmina}`,
    gmina: row.gmina,
    schedulePage: row.scheduleUrl,
    localityId: row.id,
    parentId: row.parentId,
  };
}

const hits = (places: Place[], limit: number): SearchHit[] =>
  places
    .map(({ id, label }) => ({ id, label }))
    .sort(byLabel)
    .slice(0, limit);

const searchCached = unstable_cache(
  async (terms: string[]): Promise<SearchHit[]> => {
    const [streetRows, villageRows] = await Promise.all([
      streetPlaces(and(listed, matchAll(streets.search, terms)), SEARCH_LIMIT),
      villagePlaces(matchAll(localities.search, terms), SEARCH_LIMIT),
    ]);
    return hits(
      [...streetRows.map(streetPlace), ...villageRows.map(villagePlace)],
      SEARCH_LIMIT,
    );
  },
  ["search"],
  CACHE,
);

/**
 * At most 8 places matching every word of q. The fallback when the search
 * field cannot load the index.
 */
export async function search(q: string): Promise<SearchHit[]> {
  // As findPlaces in lib/search.ts: the first reading that finds anything.
  for (const { text, nr } of readings(q)) {
    const terms = searchTerms(text);
    if (terms.length === 0) continue;
    const found = await searchCached(terms);
    if (found.length > 0) {
      return nr ? found.map((hit) => ({ ...hit, nr })) : found;
    }
  }
  return [];
}

/**
 * Every place search can find, as [id, label] (~4 KB gzip), so the search
 * field matches on the device with no request per keystroke. The version is
 * a hash of the content: its URL changes with the data, so the CDN may keep
 * each version for good.
 */
export const searchIndex = unstable_cache(
  async (): Promise<{ version: string; places: SearchIndex }> => {
    const [streetRows, villageRows] = await Promise.all([
      streetPlaces(listed, 100_000),
      villagePlaces(undefined, 100_000),
    ]);
    const places: SearchIndex = hits(
      [...streetRows.map(streetPlace), ...villageRows.map(villagePlace)],
      Number.POSITIVE_INFINITY,
    ).map(({ id, label }) => [id, label]);
    const version = createHash("sha256")
      .update(JSON.stringify(places))
      .digest("hex")
      .slice(0, 16);
    return { version, places };
  },
  ["search-index"],
  CACHE,
);

/** Where the search field loads the current index from. */
export async function searchIndexUrl(): Promise<string> {
  const { version } = await searchIndex();
  return `/api/search-index/${version}`;
}

/** A few addresses for the home page. */
export const examplePlaces = unstable_cache(
  async (limit: number): Promise<SearchHit[]> => {
    const [streetRows, villageRows] = await Promise.all([
      streetPlaces(listed, limit),
      villagePlaces(undefined, limit),
    ]);
    return hits(
      [...streetRows.map(streetPlace), ...villageRows.map(villagePlace)],
      limit,
    );
  },
  ["example-places"],
  CACHE,
);

async function findPlace(id: string): Promise<Place | null> {
  const [street] = await streetPlaces(eq(streets.id, id), 1);
  if (street) return streetPlace(street);
  const [village] = await villagePlaces(eq(localities.id, id), 1);
  return village ? villagePlace(village) : null;
}

async function wasteZoneFor(place: Place, nr: string | null) {
  const localityIds = [place.localityId];
  if (place.parentId) localityIds.push(place.parentId);
  const wholeLocality = and(
    isNull(zoneMembers.streetId),
    inArray(zoneMembers.localityId, localityIds),
  );
  const candidates = await db()
    .select({
      zoneId: zoneMembers.zoneId,
      localityId: zoneMembers.localityId,
      streetId: zoneMembers.streetId,
      houseFrom: zoneMembers.houseFrom,
      houseTo: zoneMembers.houseTo,
      parity: zoneMembers.parity,
    })
    .from(zoneMembers)
    .innerJoin(zones, eq(zones.id, zoneMembers.zoneId))
    .where(
      and(
        eq(zones.type, "waste"),
        place.streetId
          ? or(eq(zoneMembers.streetId, place.streetId), wholeLocality)
          : wholeLocality,
      ),
    );
  return {
    id: pickZone(candidates, { ...place, nr }),
    split: isSplitStreet(candidates, place),
  };
}

function bySubtype(a: ZoneEvent, b: ZoneEvent): number {
  return SUBTYPE_ORDER.indexOf(a.subtype) - SUBTYPE_ORDER.indexOf(b.subtype);
}

async function zoneEvents(zoneId: string, from: string) {
  const rows = await db()
    .select()
    .from(events)
    .where(and(eq(events.zoneId, zoneId), gte(events.start, from)))
    .orderBy(asc(events.start));
  return rows.sort((a, b) => a.start.localeCompare(b.start) || bySubtype(a, b));
}

function sourcesOf(rows: ZoneEvent[]): SourceView[] {
  const byDoc = new Map<string, SourceView>();
  for (const row of rows) {
    if (byDoc.has(row.sourceDoc)) continue;
    byDoc.set(row.sourceDoc, {
      label: row.sourceRef ?? row.sourceDoc,
      url: row.sourceUrl,
      checkedAt: row.checkedAt,
    });
  }
  return [...byDoc.values()];
}

// Keyed by the Warsaw day, so past pickups drop out at midnight.
const placeCached = unstable_cache(
  async (
    id: string,
    today: string,
    nr: string | null,
  ): Promise<PlaceView | null> => {
    const place = await findPlace(id);
    if (!place) return null;

    const zone = await wasteZoneFor(place, nr);
    const upcoming = zone.id ? await zoneEvents(zone.id, today) : [];
    // On a split street the number picks the zone; one that picks none is
    // set aside, and the page asks again.
    const askNumber = zone.split && !zone.id;

    const days: PickupDay[] = [];
    for (const event of upcoming) {
      const pickup: Pickup = {
        id: event.id,
        subtype: event.subtype,
        label: event.label,
        putOutBy:
          typeof event.payload?.putOutBy === "string"
            ? event.payload.putOutBy
            : null,
        shiftedFrom: event.shiftedFrom,
      };
      const last = days.at(-1);
      if (last?.date === event.start) last.pickups.push(pickup);
      else days.push({ date: event.start, pickups: [pickup] });
    }

    return {
      id: place.id,
      kind: place.kind,
      name: place.name,
      label: place.label,
      area: place.area,
      gmina: place.gmina,
      zoneId: zone.id,
      nr: askNumber ? null : nr,
      askNumber,
      unknownNr: askNumber ? nr : null,
      today,
      schedulePage: place.schedulePage,
      days,
      sources: sourcesOf(upcoming),
      verified: upcoming.every((e) => e.verified),
    };
  },
  ["place"],
  CACHE,
);

/** nr: a house number as given (?nr=); anything invalid is ignored. */
export function getPlace(
  id: string,
  nr?: string | null,
): Promise<PlaceView | null> {
  // Event dates are ISO days in Europe/Warsaw, so compare against the Warsaw day, not UTC.
  return placeCached(id, todayInWarsaw(), houseNumber(nr));
}

const zoneCached = unstable_cache(
  async (zoneId: string, today: string) => {
    const [zone] = await db().select().from(zones).where(eq(zones.id, zoneId));
    if (!zone) return null;
    return { ...zone, events: await zoneEvents(zone.id, today) };
  },
  ["zone"],
  CACHE,
);

export function getZone(zoneId: string) {
  return zoneCached(zoneId, todayInWarsaw());
}
