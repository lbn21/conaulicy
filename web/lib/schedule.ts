import "server-only";
import {
  and,
  asc,
  eq,
  gte,
  isNull,
  like,
  notExists,
  or,
  type SQL,
} from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
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
import { normalize } from "@/lib/normalize";

// Every read goes through Next's data cache, tagged DATASET: a traffic spike
// hits the cache, not Neon. After an import, POST /api/revalidate purges the
// tag. The hourly revalidate is only a safety net.
export const DATASET = "dataset";
const CACHE = { tags: [DATASET], revalidate: 3600 };

export type ZoneEvent = typeof events.$inferSelect;

export type SearchHit = { id: string; label: string };

type Place = {
  id: string;
  kind: "ulica" | "wies";
  name: string;
  label: string;
  area: string;
  gmina: string;
  schedulePage: string | null;
  localityId: string;
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

function gminaShortName(name: string): string {
  return name.replace(/\s*\(.*\)$/, "");
}

// "ul. Asnyka" and "ulica Asnyka" find the same street.
const IGNORED_TERMS = new Set(["ul", "ulica"]);

const searchTerms = (q: string) =>
  normalize(q)
    .split(" ")
    .filter((term) => term && !IGNORED_TERMS.has(term));

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

const streetPlaces = (where: SQL | undefined, limit: number) =>
  db()
    .select({
      id: streets.id,
      prefix: streets.prefix,
      name: streets.name,
      localityId: streets.localityId,
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
      gmina: gminy.name,
      scheduleUrl: gminy.scheduleUrl,
    })
    .from(localities)
    .innerJoin(gminy, eq(gminy.id, localities.gminaId))
    .where(and(withoutStreets(), where))
    .orderBy(asc(localities.search))
    .limit(limit);

type StreetRow = Awaited<ReturnType<typeof streetPlaces>>[number];
type VillageRow = Awaited<ReturnType<typeof villagePlaces>>[number];

function streetPlace(row: StreetRow): Place {
  const name = `${row.prefix} ${row.name}`;
  return {
    id: row.id,
    kind: "ulica",
    name,
    label: `${name}, ${row.locality}`,
    area: row.locality,
    gmina: row.gmina,
    schedulePage: row.scheduleUrl,
    localityId: row.localityId,
    streetId: row.id,
  };
}

function villagePlace(row: VillageRow): Place {
  const gmina = gminaShortName(row.gmina);
  return {
    id: row.id,
    kind: "wies",
    name: row.name,
    label: `${row.name} (gm. ${gmina})`,
    area: `gmina ${gmina}`,
    gmina: row.gmina,
    schedulePage: row.scheduleUrl,
    localityId: row.id,
  };
}

const hits = (places: Place[], limit: number): SearchHit[] =>
  places
    .sort((a, b) => a.label.localeCompare(b.label, "pl"))
    .slice(0, limit)
    .map(({ id, label }) => ({ id, label }));

const searchCached = unstable_cache(
  async (terms: string[]): Promise<SearchHit[]> => {
    const [streetRows, villageRows] = await Promise.all([
      streetPlaces(matchAll(streets.search, terms), 8),
      villagePlaces(matchAll(localities.search, terms), 8),
    ]);
    return hits(
      [...streetRows.map(streetPlace), ...villageRows.map(villagePlace)],
      8,
    );
  },
  ["search"],
  CACHE,
);

/** At most 8 places matching every word of q; never the whole index. */
export async function search(q: string): Promise<SearchHit[]> {
  const terms = searchTerms(q);
  return terms.length === 0 ? [] : searchCached(terms);
}

/** A few addresses for the home page. */
export const examplePlaces = unstable_cache(
  async (limit: number): Promise<SearchHit[]> => {
    const [streetRows, villageRows] = await Promise.all([
      streetPlaces(undefined, limit),
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

async function wasteZoneFor(place: Place) {
  const sameLocality = and(
    isNull(zoneMembers.streetId),
    eq(zoneMembers.localityId, place.localityId),
  );
  const [zone] = await db()
    .select({ id: zones.id })
    .from(zoneMembers)
    .innerJoin(zones, eq(zones.id, zoneMembers.zoneId))
    .where(
      and(
        eq(zones.type, "waste"),
        place.streetId
          ? or(eq(zoneMembers.streetId, place.streetId), sameLocality)
          : sameLocality,
      ),
    )
    // A street's own entry wins over its whole locality's.
    .orderBy(asc(isNull(zoneMembers.streetId)))
    .limit(1);
  return zone ?? null;
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
  async (id: string, today: string): Promise<PlaceView | null> => {
    const place = await findPlace(id);
    if (!place) return null;

    const zone = await wasteZoneFor(place);
    const upcoming = zone ? await zoneEvents(zone.id, today) : [];

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
      zoneId: zone?.id ?? null,
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

export function getPlace(id: string): Promise<PlaceView | null> {
  // Event dates are ISO days in Europe/Warsaw, so compare against the Warsaw day, not UTC.
  return placeCached(id, todayInWarsaw());
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
