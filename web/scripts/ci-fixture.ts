// npm run db:ci-fixture: the CI fixture. Replaces EVERYTHING in a local
// database (CI's service container, a local Docker Postgres; it refuses any
// other, see lib/local-db.ts) with a small made-up dataset, so the build and
// the checks have every kind of place to test. Production never holds it.
// Dates come from simple rules, for the 12 months starting with the current
// one; nothing here is a real schedule.
//
// Covers: a city street from the old fixture URL (ul. Adama Asnyka), streets
// with diacritics, a street in no zone, a village with streets, villages
// without, one month with 6 pickup days and holiday-shifted dates, and the
// home page's examples (lib/examples.ts) under their real ids.
import { createHash } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { addDays, todayInWarsaw } from "../lib/dates.ts";
import {
  events,
  gminy,
  localities,
  meta,
  streets,
  zoneMembers,
  zones,
} from "../lib/db/schema.ts";
import { normalize } from "../lib/normalize.ts";
import { localitySearchLabel, streetLabel } from "../lib/places.ts";
import { GMINA_SCHEDULE_PAGES } from "./lib/gmina-pages.ts";
import { localDatabaseUrl } from "./lib/local-db.ts";

// A placeholder, never a public page: the fixture only lives in CI.
const SOURCE_URL = "https://ci-fixture.invalid/harmonogram";

const GMINY = [
  {
    id: "1809011",
    teryt: "1809011",
    name: "Lubaczów (miasto)",
    scheduleUrl: GMINA_SCHEDULE_PAGES["1809011"],
  },
  {
    id: "1809042",
    teryt: "1809042",
    name: "Lubaczów (gmina)",
    scheduleUrl: GMINA_SCHEDULE_PAGES["1809042"],
  },
];

const LOCALITIES = [
  { id: "0972447", gminaId: "1809011", name: "Lubaczów", kind: "miasto" },
  { id: "0606234", gminaId: "1809042", name: "Lisie Jamy", kind: "wies" },
  { id: "0606010", gminaId: "1809042", name: "Dąbrowa", kind: "wies" },
  { id: "0606375", gminaId: "1809042", name: "Szczutków", kind: "wies" },
] as const;

// SYM_UL 9xxxx are made up.
const STREETS = [
  ["0972447", "00470", "Adama Asnyka"],
  ["0972447", "20291", "Juliusza Słowackiego"],
  ["0972447", "12740", "Adama Mickiewicza"],
  ["0972447", "19253", "Rynek"],
  ["0972447", "16264", "Józefa Piłsudskiego"],
  ["0972447", "90004", "Tadeusza Kościuszki"],
  ["0972447", "90005", "Stefana Żeromskiego"],
  ["0972447", "23434", "Ustronna"],
  ["0606234", "90007", "Polna"],
  ["0606234", "90008", "Leśna"],
] as const;

type Rule = {
  /** 1 = Monday … 6 = Saturday, as Date.getUTCDay(). */
  weekday: number;
  mixed: string[];
  /** Fractions picked up only October–April. */
  winter?: string[];
  recycling: string[];
  /** Nth weekday of the month for recycling. */
  recyclingDay: { weekday: number; nth: number };
  bulkyMonths: number[];
  putOutBy?: string;
};

const CITY_RECYCLING = ["papier", "tworzywa", "szklo"];

const ZONES: Array<{
  id: string;
  name: string;
  members: Array<{
    localityId: string;
    streetId?: string;
    houseFrom?: string;
    houseTo?: string;
    parity?: "even" | "odd";
  }>;
  rule: Rule;
}> = [
  {
    id: "waste:miasto-s1",
    name: "Lubaczów, sektor 1",
    members: [
      ...["00470", "20291", "12740", "19253", "16264"].map((sym) => ({
        localityId: "0972447",
        streetId: `0972447-${sym}`,
      })),
      // A made-up split street: even 2–40 here, odd ones in sektor 2, and
      // no zone for even numbers above 40.
      {
        localityId: "0972447",
        streetId: "0972447-90004",
        houseFrom: "2",
        houseTo: "40",
        parity: "even",
      },
    ],
    rule: {
      weekday: 1,
      mixed: ["zmieszane", "bio"],
      winter: ["popiol"],
      recycling: CITY_RECYCLING,
      recyclingDay: { weekday: 3, nth: 1 },
      bulkyMonths: [3, 9],
    },
  },
  {
    id: "waste:miasto-s2",
    name: "Lubaczów, sektor 2",
    members: [
      { localityId: "0972447", streetId: "0972447-90004", parity: "odd" },
      { localityId: "0972447", streetId: "0972447-90005" },
    ],
    rule: {
      weekday: 2,
      mixed: ["zmieszane", "bio"],
      winter: ["popiol"],
      recycling: CITY_RECYCLING,
      recyclingDay: { weekday: 3, nth: 2 },
      bulkyMonths: [3, 9],
    },
  },
  {
    id: "waste:gmina-s1",
    name: "Lisie Jamy, Dąbrowa i Szczutków",
    members: ["0606234", "0606010", "0606375"].map((localityId) => ({
      localityId,
    })),
    rule: {
      weekday: 4,
      mixed: ["zmieszane_i_bio"],
      recycling: ["papier", "tworzywa_metale", "szklo"],
      recyclingDay: { weekday: 5, nth: 1 },
      bulkyMonths: [4, 10],
      putOutBy: "06:00",
    },
  },
];

const LABELS: Record<string, string> = {
  zmieszane: "Zmieszane",
  bio: "Bio",
  popiol: "Popiół",
  zmieszane_i_bio: "Zmieszane i bio",
  papier: "Papier",
  tworzywa: "Tworzywa sztuczne",
  tworzywa_metale: "Tworzywa i metale",
  szklo: "Szkło",
  wielkogabarytowe: "Wielkogabarytowe",
  elektro: "Elektryczne i elektroniczne",
};

function weekdayOf(iso: string): number {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}

function easter(year: number): string {
  // Anonymous Gregorian algorithm.
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Polish public holidays (ustawa o dniach wolnych od pracy). */
function holidays(year: number): Set<string> {
  const fixed = [
    "01-01",
    "01-06",
    "05-01",
    "05-03",
    "08-15",
    "11-01",
    "11-11",
    "12-24",
    "12-25",
    "12-26",
  ].map((md) => `${year}-${md}`);
  const sunday = easter(year);
  return new Set([
    ...fixed,
    sunday,
    addDays(sunday, 1),
    addDays(sunday, 49),
    addDays(sunday, 60),
  ]);
}

const HOLIDAYS = new Set<string>();

function isHoliday(iso: string): boolean {
  const year = Number(iso.slice(0, 4));
  if (![...HOLIDAYS].some((d) => d.startsWith(`${year}-`))) {
    for (const d of holidays(year)) HOLIDAYS.add(d);
  }
  return HOLIDAYS.has(iso);
}

/** A pickup on a holiday moves to the next working day. */
function shift(iso: string): { start: string; shiftedFrom: string | null } {
  if (!isHoliday(iso)) return { start: iso, shiftedFrom: null };
  let day = addDays(iso, 1);
  while (weekdayOf(day) === 0 || isHoliday(day)) day = addDays(day, 1);
  return { start: day, shiftedFrom: iso };
}

function monthDays(month: string): string[] {
  const days: string[] = [];
  for (let d = `${month}-01`; d.startsWith(month); d = addDays(d, 1)) {
    days.push(d);
  }
  return days;
}

function nth(days: string[], weekday: number, n: number): string {
  return days.filter((d) => weekdayOf(d) === weekday)[n - 1];
}

type Pickup = { subtype: string; date: string };

function zonePickups(rule: Rule, month: string, extraDays: boolean) {
  const days = monthDays(month);
  const monthNo = Number(month.slice(5));
  const winter = monthNo >= 10 || monthNo <= 4;
  const pickups: Pickup[] = [];

  // Every other week, counted in whole weeks since 2026-01-05 (a Monday).
  const epoch = Date.UTC(2026, 0, 5);
  for (const date of days) {
    if (weekdayOf(date) !== rule.weekday) continue;
    const week = Math.floor((Date.parse(date) - epoch) / (7 * 86_400_000));
    if (week % 2 !== 0) continue;
    for (const subtype of [
      ...rule.mixed,
      ...(winter ? (rule.winter ?? []) : []),
    ])
      pickups.push({ subtype, date });
  }

  const recycling = nth(days, rule.recyclingDay.weekday, rule.recyclingDay.nth);
  for (const subtype of rule.recycling)
    pickups.push({ subtype, date: recycling });

  if (rule.bulkyMonths.includes(monthNo)) {
    const date = nth(days, 6, 3);
    for (const subtype of ["wielkogabarytowe", "elektro"])
      pickups.push({ subtype, date });
  }

  // One busy month: extra mixed-waste Fridays up to 6 pickup days.
  if (extraDays) {
    const fridays = days.filter((d) => weekdayOf(d) === 5);
    const dates = () => new Set(pickups.map((p) => p.date)).size;
    while (dates() < 6 && fridays.length > 0) {
      pickups.push({ subtype: rule.mixed[0], date: fridays.shift() as string });
    }
  }
  return pickups;
}

function months(today: string, count: number): string[] {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)) - 1;
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(year, month + i, 1));
    return d.toISOString().slice(0, 7);
  });
}

async function main() {
  const db = drizzle(localDatabaseUrl(), { casing: "snake_case" });
  const today = todayInWarsaw();

  const localityRows = LOCALITIES.map((l) => ({
    ...l,
    teryt: l.id,
    // Villages without streets are places: "Dąbrowa (gm. Lubaczów)".
    search: normalize(
      localitySearchLabel({
        ...l,
        parent: null,
        gmina: GMINY.find((g) => g.id === l.gminaId)?.name ?? "",
      }),
    ),
  }));
  const streetRows = STREETS.map(([localityId, sym, name]) => {
    const locality = LOCALITIES.find((l) => l.id === localityId);
    return {
      id: `${localityId}-${sym}`,
      localityId,
      teryt: sym,
      prefix: "ul.",
      name,
      search: normalize(
        streetLabel({ prefix: "ul.", name, locality: locality?.name ?? "" }),
      ),
    };
  });

  const window = months(today, 12);
  const busyMonth = window[1];
  const eventRows = ZONES.flatMap((zone) =>
    window.flatMap((month) =>
      zonePickups(
        zone.rule,
        month,
        zone.id === "waste:miasto-s1" && month === busyMonth,
      ).map(({ subtype, date }) => ({
        id: createHash("sha256")
          .update(`${zone.id}|${subtype}|${date}`)
          .digest("hex"),
        type: "waste" as const,
        subtype,
        zoneId: zone.id,
        ...shift(date),
        allDay: true,
        label: LABELS[subtype],
        sourceDoc: "ci-fixture",
        sourceUrl: SOURCE_URL,
        sourceRef: `Fikstura CI, ${zone.name}`,
        checkedAt: today,
        verified: false,
        payload: zone.rule.putOutBy ? { putOutBy: zone.rule.putOutBy } : null,
      })),
    ),
  );

  await db.transaction(async (tx) => {
    for (const table of [
      events,
      zoneMembers,
      zones,
      streets,
      localities,
      gminy,
      meta,
    ]) {
      await tx.delete(table);
    }
    await tx.insert(gminy).values(GMINY);
    await tx.insert(localities).values(localityRows);
    await tx.insert(streets).values(streetRows);
    await tx
      .insert(zones)
      .values(
        ZONES.map(({ id, name }) => ({ id, type: "waste" as const, name })),
      );
    await tx
      .insert(zoneMembers)
      .values(
        ZONES.flatMap((z) => z.members.map((m) => ({ zoneId: z.id, ...m }))),
      );
    await tx.insert(events).values(eventRows);
  });

  const shifted = eventRows.filter((e) => e.shiftedFrom);
  console.log(
    `CI fixture: ${streetRows.length} streets, ${ZONES.length} zones, ${eventRows.length} events ` +
      `(${window[0]}…${window.at(-1)}; 6 pickup days in ${busyMonth} on sektor 1; ` +
      `${shifted.length} holiday-shifted).`,
  );
  await db.$client.end();
}

await main();
