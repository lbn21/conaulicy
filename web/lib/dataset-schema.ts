// The dataset snapshot: everything the site reads of the database, in one
// JSON file (docs/database.md, "The dataset snapshot"). The import writes
// it to the private Blob store after every change (scripts/lib/dataset.ts);
// the site reads only it (lib/dataset.ts), never the database. Its types
// and its check on read live here, with no database or Next.js import, so
// the import, the CI checks and the site share them.
import type { EventType, Locality } from "./data-model.ts";
import type { Confidence, District } from "./districts.ts";

/** Bumped on any change to the shape below: the site refuses another one. */
export const DATASET_SCHEMA_VERSION = 1;

type DatasetGmina = {
  id: string;
  name: string;
  /** The gmina's own schedule page, linked when a place has no zone. */
  scheduleUrl: string | null;
};

/**
 * A place TERYT no longer lists stays, retired (scripts/import.ts): its
 * page answers 308 to replacedBy, or says it is gone.
 */
type Retired = {
  /** When the import found it gone from TERYT; null: a current place. */
  retiredAt: string | null;
  /** The place that replaced it (a reviewed rename), if any. */
  replacedBy: string | null;
};

export type DatasetLocality = Retired & {
  id: string;
  gminaId: string;
  name: string;
  kind: Locality["kind"];
  parentId: string | null;
};

type DatasetStreet = Retired & {
  id: string;
  localityId: string;
  /** TERYT CECHA. */
  prefix: string;
  name: string;
};

type DatasetZone = { id: string; type: EventType; name: string };

/**
 * A zone covers a whole street or locality: no data differs by house
 * number, so the snapshot holds no house ranges, and a member that has
 * one is refused (rangedMember), never published.
 */
export type DatasetMember = {
  zoneId: string;
  localityId: string;
  streetId: string | null;
};

/** The house-range fields a zone member must not carry. */
const RANGE_KEYS = ["houseFrom", "houseTo", "parity"] as const;

/**
 * Throws for a zone member with a house range: one rule for the builder
 * (datasetFromRows) and every read of a file (parseDataset), so a ranged
 * member fails the import and the publish loudly.
 */
export function rangedMember(
  member: Record<string, unknown>,
  at: string,
): void {
  const ranged = RANGE_KEYS.filter((key) => (member[key] ?? null) !== null);
  if (ranged.length > 0)
    throw new Error(
      `Dataset snapshot: ${at} has a house range (${ranged.join(", ")}); the site has no house numbers.`,
    );
}

/** An events row, only the columns the site shows, with its file's lastSeenAt. */
export type DatasetEvent = {
  id: string;
  type: EventType;
  subtype: string;
  zoneId: string;
  start: string;
  label: string;
  sourceDoc: string;
  sourceUrl: string;
  sourceRef: string | null;
  checkedAt: string;
  verified: boolean;
  shiftedFrom: string | null;
  /** Of events.payload, only what the site shows. */
  payload: { putOutBy: string } | null;
  /** source_files.lastSeenAt of the event's file; null: no such row. */
  seenAt: string | null;
};

export type Dataset = {
  schemaVersion: typeof DATASET_SCHEMA_VERSION;
  /** When it was built from the database. */
  generatedAt: string;
  /** The import batch it follows, if one made it. */
  batchId: string | null;
  gminy: DatasetGmina[];
  /** In the order of localities.search, as the site lists them. */
  localities: DatasetLocality[];
  /** In the order of streets.search. */
  streets: DatasetStreet[];
  zones: DatasetZone[];
  /** In the order they were written (zone_members.id). */
  zoneMembers: DatasetMember[];
  /** By zone, then start, then subtype. */
  events: DatasetEvent[];
  /** Renamed places, old id → new id (place_redirects, retired places' replacedBy). */
  redirects: Record<string, string>;
  /** The town's district names (district_aliases), for the water cron. */
  districts: District[];
};

// ------------------------------------------------------------------ check

type Check<T> = (value: unknown, at: string) => T;

function bad(at: string, what: string): never {
  throw new Error(`Dataset snapshot: ${at} is not ${what}.`);
}

const str: Check<string> = (v, at) =>
  typeof v === "string" ? v : bad(at, "a string");
const bool: Check<boolean> = (v, at) =>
  typeof v === "boolean" ? v : bad(at, "a boolean");
const nullable =
  <T>(check: Check<T>): Check<T | null> =>
  (v, at) =>
    v === null ? null : check(v, at);
const oneOf =
  <T extends string>(...values: T[]): Check<T> =>
  (v, at) =>
    values.includes(v as T) ? (v as T) : bad(at, `one of ${values.join(", ")}`);
const array =
  <T>(check: Check<T>): Check<T[]> =>
  (v, at) =>
    Array.isArray(v)
      ? v.map((item, i) => check(item, `${at}[${i}]`))
      : bad(at, "an array");
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
/** Only the shape's keys are kept. */
const object =
  <T>(shape: { [K in keyof T]: Check<T[K]> }): Check<T> =>
  (v, at) => {
    if (!isObject(v)) bad(at, "an object");
    return Object.fromEntries(
      Object.entries(shape).map(([key, check]) => [
        key,
        (check as Check<unknown>)(v[key], `${at}.${key}`),
      ]),
    ) as T;
  };
const record =
  <T>(check: Check<T>): Check<Record<string, T>> =>
  (v, at) =>
    isObject(v)
      ? Object.fromEntries(
          Object.entries(v).map(([k, x]) => [k, check(x, `${at}.${k}`)]),
        )
      : bad(at, "an object");

const eventType = oneOf<EventType>("waste", "water", "power", "weather");
const confidence = oneOf<Confidence>("high", "medium");

const checkDataset: Check<Dataset> = object<Dataset>({
  schemaVersion: (v, at) =>
    v === DATASET_SCHEMA_VERSION
      ? DATASET_SCHEMA_VERSION
      : bad(at, `schema version ${DATASET_SCHEMA_VERSION}`),
  generatedAt: str,
  batchId: nullable(str),
  gminy: array(
    object<DatasetGmina>({ id: str, name: str, scheduleUrl: nullable(str) }),
  ),
  localities: array(
    object<DatasetLocality>({
      id: str,
      gminaId: str,
      name: str,
      kind: oneOf<Locality["kind"]>("miasto", "wies", "czesc_wsi"),
      parentId: nullable(str),
      retiredAt: nullable(str),
      replacedBy: nullable(str),
    }),
  ),
  streets: array(
    object<DatasetStreet>({
      id: str,
      localityId: str,
      prefix: str,
      name: str,
      retiredAt: nullable(str),
      replacedBy: nullable(str),
    }),
  ),
  zones: array(object<DatasetZone>({ id: str, type: eventType, name: str })),
  zoneMembers: array((v, at) => {
    if (isObject(v)) rangedMember(v, at);
    return object<DatasetMember>({
      zoneId: str,
      localityId: str,
      streetId: nullable(str),
    })(v, at);
  }),
  events: array(
    object<DatasetEvent>({
      id: str,
      type: eventType,
      subtype: str,
      zoneId: str,
      start: str,
      label: str,
      sourceDoc: str,
      sourceUrl: str,
      sourceRef: nullable(str),
      checkedAt: str,
      verified: bool,
      shiftedFrom: nullable(str),
      payload: nullable(object<{ putOutBy: string }>({ putOutBy: str })),
      seenAt: nullable(str),
    }),
  ),
  redirects: record(str),
  districts: array(
    object<District>({
      id: str,
      localityId: str,
      simc: nullable(str),
      name: str,
      variants: array(str),
      confidence,
      sourceUrl: str,
      streets: array(
        object<District["streets"][number]>({
          id: str,
          confidence,
          part: nullable(str),
          sourceUrl: nullable(str),
        }),
      ),
    }),
  ),
});

/** The snapshot's JSON, checked; throws, naming the first bad field. */
export function parseDataset(json: string): Dataset {
  return checkDataset(JSON.parse(json), "dataset");
}

// ------------------------------------------------------------------ build

/** Rows as the database holds them (or the made-up dataset makes them). */
export type DatasetRows = {
  gminy: Array<{ id: string; name: string; scheduleUrl?: string | null }>;
  localities: Array<{
    id: string;
    gminaId: string;
    name: string;
    kind: Locality["kind"];
    parentId?: string | null;
    search: string;
    retiredAt?: string | null;
    replacedBy?: string | null;
  }>;
  streets: Array<{
    id: string;
    localityId: string;
    prefix: string;
    name: string;
    search: string;
    retiredAt?: string | null;
    replacedBy?: string | null;
  }>;
  zones: DatasetZone[];
  zoneMembers: Array<{
    zoneId: string;
    localityId: string;
    streetId?: string | null;
    houseFrom?: string | null;
    houseTo?: string | null;
    parity?: "even" | "odd" | null;
  }>;
  events: Array<{
    id: string;
    type: EventType;
    subtype: string;
    zoneId: string;
    start: string;
    label: string;
    sourceDoc: string;
    sourceUrl: string;
    sourceRef?: string | null;
    sourceSha256?: string | null;
    checkedAt: string;
    verified?: boolean;
    shiftedFrom?: string | null;
    payload?: Record<string, unknown> | null;
  }>;
  /** source_files: sha256 → lastSeenAt. */
  seen: Map<string, string>;
  placeRedirects: Array<{ oldId: string; newId: string }>;
  districts: District[];
};

const bySearch = <T extends { search: string }>(rows: T[]) =>
  rows.toSorted((a, b) =>
    a.search < b.search ? -1 : a.search > b.search ? 1 : 0,
  );

/**
 * The snapshot of these rows. `ordered`: localities and streets come
 * ordered by search already (the database's ORDER BY, its collation);
 * otherwise they are sorted here.
 */
export function datasetFromRows(
  rows: DatasetRows,
  {
    generatedAt,
    batchId = null,
    ordered = false,
  }: { generatedAt: string; batchId?: string | null; ordered?: boolean },
): Dataset {
  const retired = (r: {
    retiredAt?: string | null;
    replacedBy?: string | null;
  }) => ({
    retiredAt: r.retiredAt ?? null,
    replacedBy: r.replacedBy ?? null,
  });
  const localities = ordered ? rows.localities : bySearch(rows.localities);
  const streets = ordered ? rows.streets : bySearch(rows.streets);
  const redirects: Record<string, string> = {};
  for (const { oldId, newId } of rows.placeRedirects) redirects[oldId] = newId;
  for (const place of [...localities, ...streets])
    if (place.retiredAt && place.replacedBy)
      redirects[place.id] = place.replacedBy;
  const events = rows.events.toSorted(
    (a, b) =>
      (a.zoneId < b.zoneId ? -1 : a.zoneId > b.zoneId ? 1 : 0) ||
      (a.start < b.start ? -1 : a.start > b.start ? 1 : 0) ||
      (a.subtype < b.subtype ? -1 : a.subtype > b.subtype ? 1 : 0),
  );
  return {
    schemaVersion: DATASET_SCHEMA_VERSION,
    generatedAt,
    batchId,
    gminy: rows.gminy.map((g) => ({
      id: g.id,
      name: g.name,
      scheduleUrl: g.scheduleUrl ?? null,
    })),
    localities: localities.map((l) => ({
      id: l.id,
      gminaId: l.gminaId,
      name: l.name,
      kind: l.kind,
      parentId: l.parentId ?? null,
      ...retired(l),
    })),
    streets: streets.map((s) => ({
      id: s.id,
      localityId: s.localityId,
      prefix: s.prefix,
      name: s.name,
      ...retired(s),
    })),
    zones: rows.zones.map(({ id, type, name }) => ({ id, type, name })),
    zoneMembers: rows.zoneMembers.map((m, i) => {
      rangedMember(m, `zoneMembers[${i}]`);
      return {
        zoneId: m.zoneId,
        localityId: m.localityId,
        streetId: m.streetId ?? null,
      };
    }),
    events: events.map((e) => ({
      id: e.id,
      type: e.type,
      subtype: e.subtype,
      zoneId: e.zoneId,
      start: e.start,
      label: e.label,
      sourceDoc: e.sourceDoc,
      sourceUrl: e.sourceUrl,
      sourceRef: e.sourceRef ?? null,
      checkedAt: e.checkedAt,
      verified: e.verified ?? false,
      shiftedFrom: e.shiftedFrom ?? null,
      payload:
        typeof e.payload?.putOutBy === "string"
          ? { putOutBy: e.payload.putOutBy }
          : null,
      seenAt: (e.sourceSha256 && rows.seen.get(e.sourceSha256)) || null,
    })),
    redirects,
    districts: rows.districts,
  };
}
