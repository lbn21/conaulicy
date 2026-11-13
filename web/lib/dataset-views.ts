// What the pages read of the dataset (lib/dataset-schema.ts), as plain
// functions of the snapshot: lib/schedule.ts gives them the current one
// (lib/dataset.ts), scripts/check-dataset.ts checks them against the
// database. No I/O and no Next.js here; dates and house numbers are
// filtered here, per call, never in a cache key.
import { createHash } from "node:crypto";
import type {
  Dataset,
  DatasetEvent,
  DatasetLocality,
  DatasetMember,
  DatasetStreet,
} from "./dataset-schema.ts";
import { hasSource } from "./event-source.ts";
import {
  gminaShortName,
  hasZone,
  placeList,
  streetLabel,
  streetName,
  UNLISTED_PREFIXES,
  villageLabel,
  zoneByNumber,
} from "./places.ts";
import { byLabel, type SearchHit, type SearchIndex } from "./search.ts";
import { FRACTIONS } from "./waste-bin.ts";
import { sourcesOf, wasteSchedule } from "./waste-module.ts";

export type Place = {
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
  /**
   * The value given when the register has no such number at the place
   * (lib/prg.ts isValidHouseNumber), as given; the view is then the whole
   * place's.
   */
  invalidNr: string | null;
  /** The register has givenNr at the place, so the h1 may show it. */
  knownNr: boolean;
  /** Warsaw day this view was computed for; the page renders "dziś"/"jutro" from it. */
  today: string;
  schedulePage: string | null;
  days: PickupDay[];
  /**
   * Every fraction the zone has, from all its events (past ones too), so
   * „wszystkie pojemniki” holds at the end of the data; none without one.
   */
  fractions: string[];
  sources: SourceView[];
  verified: boolean;
};

/** A street as the place queries read it (its locality and gmina joined). */
export type StreetRow = {
  id: string;
  prefix: string;
  name: string;
  localityId: string;
  parentId: string | null;
  locality: string;
  localityKind: DatasetLocality["kind"];
  gmina: string;
  scheduleUrl: string | null;
};

/** A village (part) as the place queries read it. */
export type VillageRow = {
  id: string;
  name: string;
  kind: DatasetLocality["kind"];
  parentId: string | null;
  parent: string | null;
  /** The parent has a line on /ulice: a village, or a town with listed streets. */
  parentLine: boolean;
  gmina: string;
  scheduleUrl: string | null;
};

const SUBTYPE_ORDER = FRACTIONS.map(({ subtype }) => subtype);

// Roundabouts and squares stay out of search and the examples.
const isListed = (street: { prefix: string }) =>
  !UNLISTED_PREFIXES.includes(street.prefix);

export function streetPlace(row: StreetRow): Place {
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

export function villagePlace(row: VillageRow): Place {
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

/** Upcoming events by start, then fraction (display order). */
export function byStartAndSubtype<T extends { start: string; subtype: string }>(
  a: T,
  b: T,
): number {
  return (
    a.start.localeCompare(b.start) ||
    SUBTYPE_ORDER.indexOf(a.subtype) - SUBTYPE_ORDER.indexOf(b.subtype)
  );
}

/** Distinct fractions of events with a source, in display order. */
export function fractionsOf(
  rows: Array<{ subtype: string } & Parameters<typeof hasSource>[0]>,
) {
  return [...new Set(rows.filter(hasSource).map((row) => row.subtype))].sort(
    (a, b) => SUBTYPE_ORDER.indexOf(a) - SUBTYPE_ORDER.indexOf(b),
  );
}

type UpcomingEvent = Parameters<typeof wasteSchedule>[0][number];

/**
 * A place's view from its zone's data: shared by the snapshot's
 * placeView and the database reference (scripts/check-dataset.ts).
 */
export function assemblePlaceView(
  place: Place,
  zone: { id: string | null; split: boolean },
  upcoming: UpcomingEvent[],
  fractions: string[],
  nr: string | null,
  today: string,
): PlaceView {
  // On a split street the number picks the zone; one that picks none is
  // set aside, and the page asks again.
  const askNumber = zone.split && !zone.id;
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
    invalidNr: null,
    knownNr: false,
    today,
    schedulePage: place.schedulePage,
    fractions,
    // Only events with their source and day checked (lib/event-source.ts).
    ...wasteSchedule(upcoming),
  };
}

/**
 * The search index from the place rows and the waste zones' members: the
 * index, its version (a hash of it), /ulice's list and the places without
 * pickup data.
 */
export function searchIndexFrom(
  streetRows: StreetRow[],
  villageRows: VillageRow[],
  members: DatasetMember[],
) {
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
  return { version, places, list: placeList(streetRows, villageRows), noData };
}

// ------------------------------------------------------------------ indexes

type Indexes = {
  streets: StreetRow[];
  villages: VillageRow[];
  streetById: Map<string, StreetRow>;
  villageById: Map<string, VillageRow>;
  /** Every locality and street by id, retired ones too. */
  retired: Map<string, DatasetLocality | DatasetStreet>;
  localityById: Map<string, DatasetLocality>;
  gminaById: Map<string, Dataset["gminy"][number]>;
  wasteMembers: DatasetMember[];
  eventsByZone: Map<string, DatasetEvent[]>;
};

const current = (place: { retiredAt: string | null }) => !place.retiredAt;

const built = new WeakMap<Dataset, Indexes>();

/** The dataset's lookups, built once per snapshot. */
function indexes(ds: Dataset): Indexes {
  const known = built.get(ds);
  if (known) return known;
  const localityById = new Map(ds.localities.map((l) => [l.id, l]));
  const gminaById = new Map(ds.gminy.map((g) => [g.id, g]));
  const streets: StreetRow[] = [];
  for (const s of ds.streets.filter(current)) {
    const locality = localityById.get(s.localityId);
    const gmina = locality && gminaById.get(locality.gminaId);
    if (!locality || !gmina) continue;
    streets.push({
      id: s.id,
      prefix: s.prefix,
      name: s.name,
      localityId: s.localityId,
      parentId: locality.parentId,
      locality: locality.name,
      localityKind: locality.kind,
      gmina: gmina.name,
      scheduleUrl: gmina.scheduleUrl,
    });
  }
  // A town's line on /ulice is the group of its listed streets.
  const withListed = new Set(streets.filter(isListed).map((s) => s.localityId));
  const villages: VillageRow[] = [];
  // Every village (part) is a place of its own, streets or not; the town is
  // not (it has no zone of its own), its streets are the places.
  for (const l of ds.localities.filter(current)) {
    const gmina = gminaById.get(l.gminaId);
    if (l.kind === "miasto" || !gmina) continue;
    const parent = l.parentId ? localityById.get(l.parentId) : undefined;
    villages.push({
      id: l.id,
      name: l.name,
      kind: l.kind,
      parentId: l.parentId,
      parent: parent?.name ?? null,
      parentLine: parent
        ? parent.kind !== "miasto" || withListed.has(parent.id)
        : false,
      gmina: gmina.name,
      scheduleUrl: gmina.scheduleUrl,
    });
  }
  const waste = new Set(
    ds.zones.filter((z) => z.type === "waste").map((z) => z.id),
  );
  const index: Indexes = {
    streets,
    villages,
    streetById: new Map(streets.map((s) => [s.id, s])),
    villageById: new Map(villages.map((v) => [v.id, v])),
    retired: new Map(
      [...ds.localities, ...ds.streets]
        .filter((p) => !current(p))
        .map((p) => [p.id, p]),
    ),
    localityById,
    gminaById,
    wasteMembers: ds.zoneMembers.filter((m) => waste.has(m.zoneId)),
    eventsByZone: Map.groupBy(ds.events, (e) => e.zoneId),
  };
  built.set(ds, index);
  return index;
}

// ------------------------------------------------------------------ views

function findPlace(ds: Dataset, id: string): Place | null {
  const { streetById, villageById } = indexes(ds);
  const street = streetById.get(id);
  if (street) return streetPlace(street);
  const village = villageById.get(id);
  return village ? villagePlace(village) : null;
}

function wasteZoneFor(ds: Dataset, place: Place, nr: string | null) {
  const localityIds = [place.localityId];
  if (place.parentId) localityIds.push(place.parentId);
  const candidates = indexes(ds).wasteMembers.filter(
    (m) =>
      (place.streetId !== undefined && m.streetId === place.streetId) ||
      (m.streetId === null && localityIds.includes(m.localityId)),
  );
  return zoneByNumber(candidates, place, nr);
}

/** A zone's events from `from` on, by start, then fraction. */
function zoneEvents(ds: Dataset, zoneId: string, from: string) {
  return (indexes(ds).eventsByZone.get(zoneId) ?? [])
    .filter((e) => e.start >= from)
    .sort(byStartAndSubtype);
}

/**
 * The place's view for `today` (an ISO day in Warsaw) and a house number
 * (normalised, valid for the place, or null); null: no such place.
 */
export function placeView(
  ds: Dataset,
  id: string,
  nr: string | null,
  today: string,
): PlaceView | null {
  const place = findPlace(ds, id);
  if (!place) return null;
  const zone = wasteZoneFor(ds, place, nr);
  const upcoming = zone.id ? zoneEvents(ds, zone.id, today) : [];
  const fractions = zone.id
    ? fractionsOf(indexes(ds).eventsByZone.get(zone.id) ?? [])
    : [];
  return assemblePlaceView(place, zone, upcoming, fractions, nr, today);
}

/** A zone with its gmina and its events from `today` on (its ICS feed). */
export function zoneView(ds: Dataset, zoneId: string, today: string) {
  const zone = ds.zones.find((z) => z.id === zoneId);
  if (!zone) return null;
  const { localityById, gminaById } = indexes(ds);
  // Whose schedule it is: a zone lies in one gmina.
  const member = ds.zoneMembers.find((m) => m.zoneId === zone.id);
  const locality = member && localityById.get(member.localityId);
  return {
    ...zone,
    gmina: (locality && gminaById.get(locality.gminaId)?.name) ?? null,
    events: zoneEvents(ds, zone.id, today),
  };
}

/**
 * The home page's panel (components/now-tiles.ts): every waste pickup in
 * the gminas from `from` up to `until` (ISO days, `until` excluded), only
 * those with a source (lib/event-source.ts), and their sources as the
 * street page reads them (sourcesOf), so its „Sprawdziliśmy” is the street
 * page's; with the gminas' schedule page.
 */
export function wasteWeekOf(ds: Dataset, from: string, until: string) {
  const shown = ds.events.filter(
    (e) =>
      e.type === "waste" && e.start >= from && e.start < until && hasSource(e),
  );
  return {
    count: shown.length,
    sources: sourcesOf(shown),
    schedulePage: ds.gminy.find((g) => g.scheduleUrl)?.scheduleUrl ?? null,
  };
}

const searchIndexes = new WeakMap<
  Dataset,
  ReturnType<typeof searchIndexFrom>
>();

/**
 * Every place search can find, as [id, label, type], its version (a hash
 * of the content, so its URL changes with the data), /ulice's list and
 * the places without pickup data (lib/places.ts hasZone), which the
 * sitemap leaves out. Built once per snapshot.
 */
export function searchIndexOf(ds: Dataset) {
  const known = searchIndexes.get(ds);
  if (known) return known;
  const { streets, villages, wasteMembers } = indexes(ds);
  const index = searchIndexFrom(
    streets.filter(isListed),
    villages,
    wasteMembers,
  );
  searchIndexes.set(ds, index);
  return index;
}

/**
 * Every place's id, as placeView finds them, listed or not (a roundabout's
 * too), and every retired one (its page says it is gone): for proxy.ts's
 * 404 of an unknown address (/api/places).
 */
export function placeIdsOf(ds: Dataset): string[] {
  const { streets, villages, retired } = indexes(ds);
  return [...streets, ...villages]
    .map(({ id }) => id)
    .concat([...retired.keys()]);
}

/** A place TERYT no longer lists and nothing replaced, or null. */
export function retiredPlaceOf(
  ds: Dataset,
  id: string,
): { id: string; name: string; kind: Place["kind"] } | null {
  const place = indexes(ds).retired.get(id);
  if (!place || ds.redirects[id]) return null;
  return "prefix" in place
    ? { id, name: streetName(place.prefix, place.name), kind: "ulica" }
    : { id, name: place.name, kind: "wies" };
}

/** The home page's examples (lib/examples.ts), by their own names. */
export function examplePlacesOf(ds: Dataset, ids: string[]): SearchHit[] {
  return ids
    .map((id) => findPlace(ds, id))
    .filter((place) => place !== null)
    .map(({ id, name }) => ({ id, label: name }));
}
