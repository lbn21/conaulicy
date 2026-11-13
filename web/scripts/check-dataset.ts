// npm run check:dataset
//
// The dataset snapshot is the database, as the site reads it: on CI's
// database (the made-up fixture, after npm run db:ci-fixture; it refuses
// any other), the snapshot built from it (scripts/lib/dataset.ts) gives
// what the site's reads gave when they queried the database. The
// reference below is those queries (lib/schedule.ts before t402), kept only
// here, read-only; the snapshot side is lib/dataset-views.ts, as the pages
// call it. Compared deep-equal: every place's view (with every house
// number its zones split on), every zone's events and ICS file, the home
// page's panel over several windows (what it shows), the search index (/ulice, the
// sitemap's places), every place id, the renamed places and the home
// page's examples. Then the snapshot reads back through its check
// (parseDataset). Exit 1 on any difference.
import assert from "node:assert/strict";
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
import { drizzle } from "drizzle-orm/node-postgres";
import { alias } from "drizzle-orm/pg-core";
import * as schema from "../db/schema.ts";
import { parseDataset } from "../lib/dataset-schema.ts";
import {
  assemblePlaceView,
  byStartAndSubtype,
  examplePlacesOf,
  fractionsOf,
  type Place,
  placeIdsOf,
  placeView,
  searchIndexFrom,
  searchIndexOf,
  streetPlace,
  villagePlace,
  wasteWeekOf,
  zoneView,
} from "../lib/dataset-views.ts";
import { addDays, todayInWarsaw } from "../lib/dates.ts";
import { hasSource } from "../lib/event-source.ts";
import { HOME_EXAMPLES } from "../lib/examples.ts";
import { UNLISTED_PREFIXES, zoneByNumber } from "../lib/places.ts";
import { wasteCalendar } from "../lib/waste-ics.ts";
import { sourcesChecked, sourcesOf } from "../lib/waste-module.ts";
import { buildDataset, readOnlyPool } from "./lib/dataset.ts";
import { localDatabaseUrl } from "./lib/local-db.ts";

const {
  events,
  gminy,
  localities,
  placeRedirects,
  sourceFiles,
  streets,
  zoneMembers,
  zones,
} = schema;

const url = localDatabaseUrl();
const pool = readOnlyPool(url);
const db = drizzle(pool, { schema, casing: "snake_case" });

// ------------------------------------------------- the database reference

const parent = alias(localities, "parent");
const isVillage = (kind: typeof localities.kind | typeof parent.kind) =>
  ne(kind, "miasto");
const listed = notInArray(streets.prefix, UNLISTED_PREFIXES);
const parentStreets = () =>
  db
    .select({ id: streets.id })
    .from(streets)
    .where(and(eq(streets.localityId, parent.id), listed));

const streetPlaces = (where: SQL | undefined) =>
  db
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
    .orderBy(asc(streets.search));

const villagePlaces = (where: SQL | undefined) =>
  db
    .select({
      id: localities.id,
      name: localities.name,
      kind: localities.kind,
      parentId: localities.parentId,
      parent: parent.name,
      parentLine: sql<boolean>`${or(isVillage(parent.kind), exists(parentStreets()))}`,
      gmina: gminy.name,
      scheduleUrl: gminy.scheduleUrl,
    })
    .from(localities)
    .innerJoin(gminy, eq(gminy.id, localities.gminaId))
    .leftJoin(parent, eq(parent.id, localities.parentId))
    .where(and(isVillage(localities.kind), where))
    .orderBy(asc(localities.search));

const villageRow = (
  row: Awaited<ReturnType<typeof villagePlaces>>[number],
) => ({
  ...row,
  parentLine: Boolean(row.parentLine),
});

function wasteMembers(where?: SQL) {
  return db
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
    )
    .orderBy(asc(zoneMembers.id));
}

async function findPlace(id: string): Promise<Place | null> {
  const [street] = await streetPlaces(eq(streets.id, id));
  if (street) return streetPlace(street);
  const [village] = await villagePlaces(eq(localities.id, id));
  return village ? villagePlace(villageRow(village)) : null;
}

async function zoneEvents(zoneId: string, from: string) {
  const rows = await db
    .select({ ...getTableColumns(events), seenAt: sourceFiles.lastSeenAt })
    .from(events)
    .leftJoin(sourceFiles, eq(sourceFiles.sha256, events.sourceSha256))
    .where(and(eq(events.zoneId, zoneId), gte(events.start, from)))
    .orderBy(asc(events.start));
  return rows.sort(byStartAndSubtype);
}

async function dbPlace(id: string, nr: string | null, today: string) {
  const place = await findPlace(id);
  if (!place) return null;
  const localityIds = [place.localityId];
  if (place.parentId) localityIds.push(place.parentId);
  const whole = and(
    isNull(zoneMembers.streetId),
    inArray(zoneMembers.localityId, localityIds),
  );
  const zone = zoneByNumber(
    await wasteMembers(
      place.streetId
        ? or(eq(zoneMembers.streetId, place.streetId), whole)
        : whole,
    ),
    place,
    nr,
  );
  const [upcoming, fractions] = zone.id
    ? await Promise.all([
        zoneEvents(zone.id, today),
        db
          .selectDistinct({
            subtype: events.subtype,
            sourceUrl: events.sourceUrl,
            checkedAt: events.checkedAt,
          })
          .from(events)
          .where(eq(events.zoneId, zone.id))
          .then(fractionsOf),
      ])
    : [[], []];
  return assemblePlaceView(place, zone, upcoming, fractions, nr, today);
}

async function dbZone(zoneId: string, today: string) {
  const [zone] = await db.select().from(zones).where(eq(zones.id, zoneId));
  if (!zone) return null;
  const [member] = await db
    .select({ gmina: gminy.name })
    .from(zoneMembers)
    .innerJoin(localities, eq(localities.id, zoneMembers.localityId))
    .innerJoin(gminy, eq(gminy.id, localities.gminaId))
    .where(eq(zoneMembers.zoneId, zone.id))
    .orderBy(asc(zoneMembers.id))
    .limit(1);
  return {
    ...zone,
    gmina: member?.gmina ?? null,
    events: await zoneEvents(zone.id, today),
  };
}

async function dbWasteWeek(from: string, until: string) {
  const rows = await db
    .select({
      sourceDoc: events.sourceDoc,
      sourceRef: events.sourceRef,
      sourceUrl: events.sourceUrl,
      checkedAt: events.checkedAt,
      seenAt: sourceFiles.lastSeenAt,
    })
    .from(events)
    .leftJoin(sourceFiles, eq(sourceFiles.sha256, events.sourceSha256))
    .where(
      and(
        eq(events.type, "waste"),
        gte(events.start, from),
        sql`${events.start} < ${until}`,
      ),
    );
  const pages = await db
    .select({ url: gminy.scheduleUrl })
    .from(gminy)
    .orderBy(asc(gminy.id));
  const shown = rows.filter(hasSource);
  return {
    count: shown.length,
    sources: sourcesOf(shown),
    schedulePage: pages.find((p) => p.url)?.url ?? null,
  };
}

// ------------------------------------------------------------- compare

const failures: string[] = [];
function same(label: string, actual: unknown, expected: unknown) {
  try {
    assert.deepStrictEqual(actual, expected);
  } catch (error) {
    failures.push(`${label}: ${(error as Error).message.slice(0, 2000)}`);
  }
}
/**
 * What the panel shows of a week (components/now-tiles.ts): the count, the
 * schedule page and „Sprawdziliśmy” (sourcesChecked), and each source's
 * link and check. Not a source's label: for a document several zones cite
 * (the fixture's one), it is the first event's, an order SQL left open.
 */
const panel = (week: Awaited<ReturnType<typeof dbWasteWeek>>) => ({
  count: week.count,
  schedulePage: week.schedulePage,
  checked: sourcesChecked(week.sources),
  sources: week.sources
    .map(({ url, checkedAt, seenAt }) =>
      JSON.stringify([url, checkedAt, seenAt]),
    )
    .sort(),
});

try {
  const ds = await buildDataset(url);
  same("parseDataset", parseDataset(JSON.stringify(ds)), ds);
  const today = todayInWarsaw();

  const [allStreets, allVillages, members] = await Promise.all([
    streetPlaces(undefined),
    villagePlaces(undefined),
    wasteMembers(),
  ]);
  const ids = [...allStreets, ...allVillages].map((p) => p.id);
  same("placeIds", placeIdsOf(ds), ids);

  // Every house number a zone splits on, and around it.
  const numbers = [
    null,
    ...new Set(
      members.flatMap((m) =>
        [m.houseFrom, m.houseTo].filter((n): n is string => Boolean(n)),
      ),
    ),
    "1",
    "2",
    "999",
  ];
  let views = 0;
  for (const id of ids)
    for (const nr of numbers) {
      same(
        `place ${id} nr ${nr}`,
        placeView(ds, id, nr, today),
        await dbPlace(id, nr, today),
      );
      views++;
    }
  same(
    "unknown place",
    placeView(ds, "0000000-00000", null, today),
    await dbPlace("0000000-00000", null, today),
  );

  const now = new Date(`${today}T12:00:00Z`);
  for (const { id } of await db.select({ id: zones.id }).from(zones)) {
    const fromDb = await dbZone(id, today);
    const fromSnapshot = zoneView(ds, id, today);
    same(
      `zone ${id} name, gmina, event ids`,
      [
        fromSnapshot?.name,
        fromSnapshot?.gmina,
        fromSnapshot?.events.map((e) => e.id),
      ],
      [fromDb?.name, fromDb?.gmina, fromDb?.events.map((e) => e.id)],
    );
    if (fromDb && fromSnapshot)
      same(
        `zone ${id} ICS`,
        wasteCalendar(fromSnapshot, now),
        wasteCalendar(fromDb, now),
      );
  }

  for (const [from, days] of [
    [today, 7],
    [addDays(today, -30), 90],
    [addDays(today, 200), 365],
  ] as const) {
    const until = addDays(from, days);
    same(
      `wasteWeek ${from}…${until}`,
      panel(wasteWeekOf(ds, from, until)),
      panel(await dbWasteWeek(from, until)),
    );
  }

  const listedStreets = await streetPlaces(listed);
  same(
    "search index",
    searchIndexOf(ds),
    searchIndexFrom(listedStreets, allVillages.map(villageRow), members),
  );

  const moved = await db
    .select({ oldId: placeRedirects.oldId, newId: placeRedirects.newId })
    .from(placeRedirects);
  same(
    "redirects",
    ds.redirects,
    Object.fromEntries(moved.map((r) => [r.oldId, r.newId])),
  );

  const examples = (await Promise.all(HOME_EXAMPLES.map(findPlace)))
    .filter((p) => p !== null)
    .map(({ id, name }) => ({ id, label: name }));
  same("examples", examplePlacesOf(ds, HOME_EXAMPLES), examples);

  console.log(
    `Dataset vs database: ${views} place views (${ids.length} places × ${numbers.length} numbers), ${ds.zones.length} zones with their ICS, 3 panel windows, the search index, redirects, examples.`,
  );
} finally {
  await pool.end();
}

if (failures.length > 0) {
  console.error(
    `\n${failures.length} difference(s):\n\n${failures.join("\n\n")}`,
  );
  process.exit(1);
}
console.log("The snapshot gives what the database gave.");
