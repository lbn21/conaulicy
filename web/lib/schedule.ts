import "server-only";
import { createHash } from "node:crypto";
import {
  and,
  asc,
  eq,
  exists,
  getTableColumns,
  gte,
  inArray,
  isNull,
  ne,
  notInArray,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { unstable_cache } from "next/cache";
import { todayInWarsaw } from "@/lib/dates";
import {
  db,
  events,
  gminy,
  localities,
  placeRedirects,
  sourceFiles,
  streets,
  zoneMembers,
  zones,
} from "@/lib/db";
import { DATASET } from "@/lib/headers";
import { houseNumber } from "@/lib/house";
import {
  gminaShortName,
  hasZone,
  isSplitStreet,
  movedPath,
  type PlaceList,
  pickZone,
  placeList,
  streetLabel,
  streetName,
  UNLISTED_PREFIXES,
  villageLabel,
} from "@/lib/places";
import {
  byLabel,
  type Matcher,
  matcher,
  type SearchHit,
  type SearchIndex,
} from "@/lib/search";
import { FRACTIONS } from "@/lib/waste-bin";
import { sourcesOf } from "@/lib/waste-module";

// Every read goes through Next's data cache, tagged DATASET: a traffic spike
// hits the cache, not Neon. After an import, POST /api/revalidate purges the
// tag. The hourly revalidate is only a safety net.
const CACHE = { tags: [DATASET], revalidate: 3600 };

type ZoneEvent = typeof events.$inferSelect & {
  /** source_files.lastSeenAt of the event's file; null: no such row. */
  seenAt: string | null;
};

type Place = {
  id: string;
  kind: "ulica" | "wies";
  name: string;
  label: string;
  /** TERYT's: a street's CECHA, a village's kind (lib/search.ts SearchIndex). */
  type: string;
  area: string;
  /**
   * The SIMC of the /ulice line its locality crumb links to: a street's
   * locality; a village part's village, if that has a line there;
   * otherwise null (the villages' list).
   */
  group: string | null;
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
  /** events.checkedAt: an ISO day. */
  checkedAt: string | null;
  /**
   * When an import last saw the source's file(s) (source_files.lastSeenAt,
   * the oldest of several); null when one of them has no such row (files
   * imported before the unattended import).
   */
  seenAt: string | null;
};

export type PlaceView = {
  id: string;
  kind: Place["kind"];
  name: string;
  label: string;
  area: string;
  /**
   * The SIMC of the /ulice line its locality crumb links to: a street's
   * locality; a village part's village, if that has a line there;
   * otherwise null (the villages' list).
   */
  group: string | null;
  /** Gmina name as in TERYT, e.g. "Lubaczów (miasto)". */
  gmina: string;
  /** TERYT SIMC: a street's locality, or the village (part) itself. */
  localityId: string;
  /** TERYT SIMC-SYM_UL; null for a village. */
  streetId: string | null;
  zoneId: string | null;
  /** The house number this view is for, shown after the name. */
  nr: string | null;
  /** A street split by house numbers, and no number that picks its zone. */
  askNumber: boolean;
  /** The number given on a split street when no part of it has that number. */
  unknownNr: string | null;
  /** The house number as given (?nr=, normalised), split street or not. */
  givenNr: string | null;
  /** Warsaw day this view was computed for; the page renders "dziś"/"jutro" from it. */
  today: string;
  schedulePage: string | null;
  days: PickupDay[];
  sources: SourceView[];
  verified: boolean;
};

const SUBTYPE_ORDER = FRACTIONS.map(({ subtype }) => subtype);

const parent = alias(localities, "parent");

// Every village (part) is a place of its own, streets or not; the town is
// not (it has no zone of its own), its streets are the places.
const isVillage = (kind: typeof localities.kind | typeof parent.kind) =>
  ne(kind, "miasto");

// Roundabouts and squares stay out of search and the examples.
const listed = notInArray(streets.prefix, UNLISTED_PREFIXES);

// The listed streets of a village part's parent (village or town).
const parentStreets = () =>
  db()
    .select({ id: streets.id })
    .from(streets)
    .where(and(eq(streets.localityId, parent.id), listed));

const streetPlaces = (where: SQL | undefined, limit: number) =>
  db()
    .select({
      id: streets.id,
      prefix: streets.prefix,
      name: streets.name,
      localityId: streets.localityId,
      parentId: localities.parentId,
      locality: localities.name,
      localityKind: localities.kind,
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
      kind: localities.kind,
      parentId: localities.parentId,
      parent: parent.name,
      // The village has a line on /ulice: as a place (any village), or the
      // town as the group of its listed streets.
      parentLine: sql<boolean>`${or(
        isVillage(parent.kind),
        exists(parentStreets()),
      )}`,
      gmina: gminy.name,
      scheduleUrl: gminy.scheduleUrl,
    })
    .from(localities)
    .innerJoin(gminy, eq(gminy.id, localities.gminaId))
    .leftJoin(parent, eq(parent.id, localities.parentId))
    .where(and(isVillage(localities.kind), where))
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
    type: row.prefix,
    area: row.locality,
    group: row.localityId,
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
    type: row.kind,
    area: row.parent ? `${row.parent}, gmina ${gmina}` : `gmina ${gmina}`,
    group: row.parentLine ? row.parentId : null,
    gmina: row.gmina,
    schedulePage: row.scheduleUrl,
    localityId: row.id,
    parentId: row.parentId,
  };
}

/** Waste zone members, all of them or those matching `where`. */
function wasteMembers(where?: SQL) {
  return db()
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
      where ? and(eq(zones.type, "waste"), where) : eq(zones.type, "waste"),
    );
}

/**
 * At most 8 places for q, ranked as the search field ranks them (the same
 * matcher over the same index). The fallback when the field cannot load
 * the index.
 */
export async function search(q: string): Promise<SearchHit[]> {
  return (await searchMatcher())(q).hits;
}

/**
 * Every place search can find, as [id, label, type] (4.0 KB gzip in
 * production, measured 23 Oct 2026), so the search field matches on the
 * device with no request per keystroke. The version is a hash of the
 * content: its URL changes with the data, so the CDN may keep each version
 * for good. `list` is the same places grouped for /ulice, and `noData`
 * those without pickup data (no zone, lib/places.ts hasZone); both stay on
 * the server.
 */
export const searchIndex = unstable_cache(
  async (): Promise<{
    version: string;
    places: SearchIndex;
    list: PlaceList;
    noData: string[];
  }> => {
    const [streetRows, villageRows, members] = await Promise.all([
      streetPlaces(listed, 100_000),
      villagePlaces(undefined, 100_000),
      wasteMembers(),
    ]);
    const all = [
      ...streetRows.map(streetPlace),
      ...villageRows.map(villagePlace),
    ];
    const places: SearchIndex = [...all]
      .sort(byLabel)
      .map(({ id, label, type }) => [id, label, type]);
    const version = createHash("sha256")
      .update(JSON.stringify(places))
      .digest("hex")
      .slice(0, 16);
    const noData = all
      .filter((place) => !hasZone(members, place))
      .map(({ id }) => id);
    return {
      version,
      places,
      list: placeList(streetRows, villageRows),
      noData,
    };
  },
  // v2: every village is a place, holding its streets on /ulice (task 127).
  ["search-index-v2"],
  CACHE,
);

// The matcher for the current index, prepared once per index version.
let prepared: { version: string; match: Matcher } | null = null;

/** lib/search.ts matcher over searchIndex, for /api/search and /szukaj. */
export async function searchMatcher(): Promise<Matcher> {
  const { version, places } = await searchIndex();
  if (prepared?.version !== version) {
    prepared = { version, match: matcher(places) };
  }
  return prepared.match;
}

// Postgres: undefined_table. Drizzle wraps the driver's error in `cause`.
const missingTable = (error: unknown) =>
  [error, (error as { cause?: unknown })?.cause].some(
    (e) => (e as { code?: string } | undefined)?.code === "42P01",
  );

/**
 * Renamed places: old id → new id (place_redirects, filled only by the
 * reviewed step). Before that table's migration: none.
 */
export const movedPlaces = unstable_cache(
  async (): Promise<Record<string, string>> => {
    try {
      const rows = await db()
        .select({ oldId: placeRedirects.oldId, newId: placeRedirects.newId })
        .from(placeRedirects);
      return Object.fromEntries(rows.map((r) => [r.oldId, r.newId]));
    } catch (error) {
      if (missingTable(error)) return {};
      throw error;
    }
  },
  ["moved-places"],
  CACHE,
);

/** The id a renamed place moved to, or null. */
async function placeRedirect(id: string): Promise<string | null> {
  return (await movedPlaces())[id] ?? null;
}

/**
 * Where a renamed place's old address `path` (as asked for) now lives, or
 * null: not renamed. For an id with no place of its own (getPlace null).
 */
export async function movedTarget(
  id: string,
  path: string,
): Promise<string | null> {
  const to = await placeRedirect(id);
  return to && movedPath(path, id, to);
}

/** Where the search field loads the current index from. */
export async function searchIndexUrl(): Promise<string> {
  const { version } = await searchIndex();
  return `/api/search-index/${version}`;
}

/** The home page's examples (lib/examples.ts), by their own names. */
export const examplePlaces = unstable_cache(
  async (ids: string[]): Promise<SearchHit[]> => {
    const places = await Promise.all(ids.map(findPlace));
    return places
      .filter((place) => place !== null)
      .map(({ id, name }) => ({ id, label: name }));
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
  const candidates = await wasteMembers(
    place.streetId
      ? or(eq(zoneMembers.streetId, place.streetId), wholeLocality)
      : wholeLocality,
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
    .select({ ...getTableColumns(events), seenAt: sourceFiles.lastSeenAt })
    .from(events)
    .leftJoin(sourceFiles, eq(sourceFiles.sha256, events.sourceSha256))
    .where(and(eq(events.zoneId, zoneId), gte(events.start, from)))
    .orderBy(asc(events.start));
  return rows.sort((a, b) => a.start.localeCompare(b.start) || bySubtype(a, b));
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
      group: place.group,
      gmina: place.gmina,
      localityId: place.localityId,
      streetId: place.streetId ?? null,
      zoneId: zone.id,
      // A number only matters on a split street; elsewhere it is ignored,
      // so the page never repeats one nobody checked.
      nr: zone.split && !askNumber ? nr : null,
      askNumber,
      unknownNr: askNumber ? nr : null,
      givenNr: nr,
      today,
      schedulePage: place.schedulePage,
      days,
      sources: sourcesOf(upcoming),
      verified: upcoming.every((e) => e.verified),
    };
  },
  // v5: villages with streets are places (task 127), older entries say
  // null; v4: sources' seenAt (task 121); v3: task 118 added importedAt,
  // task 120 dropped it again; v2 entries lack localityId and streetId
  // (task 117).
  ["place-v5"],
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
