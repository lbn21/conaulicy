// npm run db:ci-fixture: the CI fixture. Replaces EVERYTHING in a local
// database (CI's service container, a local Docker Postgres; it refuses any
// other, see lib/local-db.ts) with a small made-up dataset, so the build and
// the checks have every kind of place to test. Production never holds it.
// Dates come from simple rules, for the 12 months starting with the current
// one; nothing here is a real schedule.
//
// Covers: a renamed street's old id (place_redirects), a city street from the old fixture URL (ul. Adama Asnyka), streets
// with diacritics, a street in no zone, a street whose schedule has ended
// (only past dates), villages without streets, villages with streets (each
// a place too: Lisie Jamy, Młodów, and Krowica Sama in a sector of its
// own), a village part whose village has streets (Pilipy, Młodów) and one
// whose village has none (Holiki, Dąbrowa), the places of the ZUK dev mock's post 39885
// (lib/water-fixture.ts: ul. Żuki, Załuże; Lisie Jamy above), one month
// with 6 pickup days and holiday-shifted dates, and the home page's examples
// (lib/examples.ts) under their real ids, and the PDF's worst case (WORST:
// every fraction, the most dates and marks the PDF is sized for).
import { createHash } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { addDays, todayInWarsaw } from "../lib/dates.ts";
import {
  events,
  gminy,
  localities,
  meta,
  placeRedirects,
  streets,
  zoneMembers,
  zones,
} from "../lib/db/schema.ts";
import { normalize } from "../lib/normalize.ts";
import { DAY_MARKS, MONTH_DAYS } from "../lib/pdf-grid.ts";
import { localitySearchLabel, streetLabel, terytName } from "../lib/places.ts";
import { FRACTIONS, tones } from "../lib/waste-bin.ts";
import { polishHolidays } from "./import/waste/lib.ts";
import { GMINA_SCHEDULE_PAGES } from "./lib/gmina-pages.ts";
import { unsourced } from "./lib/import-data.ts";
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
  { id: "0606286", gminaId: "1809042", name: "Młodów", kind: "wies" },
  { id: "0606464", gminaId: "1809042", name: "Załuże", kind: "wies" },
  { id: "0606180", gminaId: "1809042", name: "Krowica Sama", kind: "wies" },
  {
    id: "0606300",
    gminaId: "1809042",
    name: "Pilipy",
    kind: "czesc_wsi",
    parentId: "0606286",
  },
  {
    id: "0606027",
    gminaId: "1809042",
    name: "Holiki",
    kind: "czesc_wsi",
    parentId: "0606010",
  },
] as const;

// [SIMC, SYM_UL, NAZWA_1, NAZWA_2], as TERYT ULIC; SYM_UL 9xxxx are made up.
const STREETS = [
  ["0972447", "00470", "Asnyka", "Adama"],
  ["0972447", "20291", "Słowackiego", "Juliusza"],
  ["0972447", "12740", "Mickiewicza", "Adama"],
  ["0972447", "19253", "Rynek", null],
  ["0972447", "16264", "Piłsudskiego", "Józefa"],
  ["0972447", "90004", "Kościuszki", "Tadeusza"],
  ["0972447", "90005", "Żeromskiego", "Stefana"],
  ["0972447", "23434", "Ustronna", null],
  ["0972447", "90009", "Wrzosowa", null],
  ["0972447", "26555", "Żuki", null],
  ["0606234", "90007", "Polna", null],
  ["0606234", "90008", "Leśna", null],
  ["0606286", "24550", "Wodna", null],
  ["0606180", "90010", "Szkolna", null],
  // Longer than any real place's name (the longest, 2026-11:
  // „ul. Gen. Przemysława Nakoniecznikoffa”): check-pdf prints its PDF.
  [
    "0972447",
    "90011",
    "Nakoniecznikoffa-Jeziorańskiego",
    "Generała Przemysława Ignacego",
  ],
  // The PDF's worst case (WORST, below).
  ["0972447", "90012", "Zapasowa", null],
] as const;

// The CI fixture is the only place a redirect is made without review: it
// is made-up data (scripts/routes/query.mjs checks the 308s).
const REDIRECTS = [
  {
    oldId: "0972447-99999",
    newId: "0972447-00470",
    reason: "CI fixture: a made-up rename",
  },
];

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

/**
 * The PDF's worst case, made from its bounds, never from a real schedule:
 * every fraction the site knows (ALL_TONES, from FRACTIONS, with the
 * site's names; those sharing a colour token share one key entry,
 * lib/pdf-key.ts KEY_TOKENS), MONTH_DAYS dates in every month, DAY_MARKS
 * fractions on each (in turn, so every one appears), and one date a month
 * moved (lib/pdf-grid.ts). check-pdf prints its PDF as every other.
 */
const WORST = {
  id: "waste:miasto-worst",
  name: "Lubaczów, najpełniejszy harmonogram",
  streetId: "0972447-90012",
};

/** Every fraction the site knows, once each, in FRACTIONS order. */
const ALL_TONES = [
  ...new Set(FRACTIONS.flatMap(({ subtype }) => tones(subtype))),
];

function worstPickups(month: string) {
  const names = new Map(FRACTIONS.map((f) => [f.subtype, f.label]));
  return Array.from({ length: MONTH_DAYS }, (_, d) => {
    // Every third day from the 1st: within any month, two digits too.
    const date = `${month}-${String(1 + 3 * d).padStart(2, "0")}`;
    return Array.from({ length: DAY_MARKS }, (_, k) => {
      const subtype = ALL_TONES[(d * DAY_MARKS + k) % ALL_TONES.length];
      return {
        subtype,
        label: names.get(subtype) ?? subtype,
        start: date,
        // The last date of a month moved from the day before.
        shiftedFrom: d === MONTH_DAYS - 1 ? addDays(date, -1) : null,
      };
    });
  }).flat();
}

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
  /** Only the three months before this one: a schedule that has ended. */
  ended?: true;
  /** Only this many months from this one: next year's not yet published. */
  count?: number;
}> = [
  {
    id: "waste:miasto-s1",
    name: "Lubaczów, sektor 1",
    members: [
      ...["00470", "20291", "12740", "16264"].map((sym) => ({
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
      { localityId: "0972447", streetId: "0972447-26555" },
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
    name: "Lisie Jamy, Dąbrowa, Szczutków, Młodów i Załuże",
    members: [
      "0606464",
      "0606234",
      "0606010",
      "0606375",
      "0606286",
      "0606300",
      "0606027",
    ].map((localityId) => ({
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
  {
    id: "waste:gmina-s2",
    name: "Krowica Sama, sektor 2",
    members: [{ localityId: "0606180" }],
    rule: {
      weekday: 2,
      mixed: ["zmieszane_i_bio"],
      recycling: ["papier", "tworzywa_metale", "szklo"],
      recyclingDay: { weekday: 5, nth: 2 },
      bulkyMonths: [4, 10],
      putOutBy: "06:00",
    },
  },
  {
    id: "waste:miasto-s3",
    name: "Lubaczów, sektor 3",
    members: [{ localityId: "0972447", streetId: "0972447-90009" }],
    rule: {
      weekday: 3,
      mixed: ["zmieszane", "bio"],
      recycling: CITY_RECYCLING,
      recyclingDay: { weekday: 4, nth: 1 },
      bulkyMonths: [],
    },
    ended: true,
  },
  {
    // A street with two months of dates (the year's end), so the PDF's
    // calendar is checked with fewer months than the window; recycling on
    // its first Monday, with the mixed and the bio: five marks on one day,
    // as the real data's fullest (2026-11; check-pdf: none wrap).
    id: "waste:miasto-s4",
    name: "Lubaczów, sektor 4",
    members: [
      { localityId: "0972447", streetId: "0972447-19253" },
      { localityId: "0972447", streetId: "0972447-90011" },
    ],
    rule: {
      weekday: 1,
      mixed: ["zmieszane", "bio"],
      recycling: CITY_RECYCLING,
      recyclingDay: { weekday: 1, nth: 1 },
      bulkyMonths: [3, 9],
    },
    count: 2,
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

const HOLIDAYS = new Set<string>();

function isHoliday(iso: string): boolean {
  const year = Number(iso.slice(0, 4));
  if (![...HOLIDAYS].some((d) => d.startsWith(`${year}-`))) {
    for (const d of polishHolidays(year)) HOLIDAYS.add(d);
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

/** `count` months from the current one, or from `offset` months away. */
function months(today: string, count: number, offset = 0): string[] {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)) - 1 + offset;
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
    // Villages are places: "Dąbrowa (gm. Lubaczów)".
    search: normalize(
      localitySearchLabel({
        ...l,
        parent:
          LOCALITIES.find((p) => "parentId" in l && p.id === l.parentId)
            ?.name ?? null,
        gmina: GMINY.find((g) => g.id === l.gminaId)?.name ?? "",
      }),
    ),
  }));
  const streetRows = STREETS.map(([localityId, sym, nazwa1, nazwa2]) => {
    const locality = LOCALITIES.find((l) => l.id === localityId);
    const name = terytName(nazwa1, nazwa2);
    return {
      id: `${localityId}-${sym}`,
      localityId,
      teryt: sym,
      prefix: "ul.",
      name,
      nazwa1,
      nazwa2,
      search: normalize(
        streetLabel({ prefix: "ul.", name, locality: locality?.name ?? "" }),
      ),
    };
  });

  const window = months(today, 12);
  const ended = months(today, 3, -3);
  const busyMonth = window[1];
  const eventRows = ZONES.flatMap((zone) =>
    (zone.ended ? ended : window.slice(0, zone.count)).flatMap((month) =>
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

  const worstRows = window.flatMap((month) =>
    worstPickups(month).map((pickup) => ({
      id: createHash("sha256")
        .update(`${WORST.id}|${pickup.subtype}|${pickup.start}`)
        .digest("hex"),
      type: "waste" as const,
      subtype: pickup.subtype,
      zoneId: WORST.id,
      start: pickup.start,
      shiftedFrom: pickup.shiftedFrom,
      allDay: true,
      label: pickup.label,
      sourceDoc: "ci-fixture",
      sourceUrl: SOURCE_URL,
      sourceRef: `Fikstura CI, ${WORST.name}`,
      checkedAt: today,
      // Verified, unlike the rest: its PDF has no unverified note, and
      // check-pdf finds its layout the same as theirs.
      verified: true,
      payload: null,
    })),
  );
  eventRows.push(...worstRows);

  // No source, no display (lib/event-source.ts): every fixture event is
  // shown, so the site's checks run on all of them.
  const noSource = unsourced(eventRows);
  if (noSource.length > 0)
    throw new Error(
      `CI fixture: events without a source:\n${noSource.join("\n")}`,
    );

  await db.transaction(async (tx) => {
    for (const table of [
      placeRedirects,
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
    await tx.insert(zones).values(
      [...ZONES, WORST].map(({ id, name }) => ({
        id,
        type: "waste" as const,
        name,
      })),
    );
    await tx
      .insert(zoneMembers)
      .values([
        ...ZONES.flatMap((z) => z.members.map((m) => ({ zoneId: z.id, ...m }))),
        { zoneId: WORST.id, localityId: "0972447", streetId: WORST.streetId },
      ]);
    await tx.insert(events).values(eventRows);
    // A renamed street's old page (made up): it must answer 308 to the new.
    await tx.insert(placeRedirects).values(REDIRECTS);
  });

  const shifted = eventRows.filter((e) => e.shiftedFrom);
  console.log(
    `CI fixture: ${streetRows.length} streets, ${ZONES.length + 1} zones, ${eventRows.length} events ` +
      `(${window[0]}…${window.at(-1)}; 6 pickup days in ${busyMonth} on sektor 1; ` +
      `${shifted.length} holiday-shifted).`,
  );
  await db.$client.end();
}

await main();
