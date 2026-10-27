// The pure parts of the waste schedule domain (docs/import.md): events from
// a reading, validation, the literal checks of Grok's reply, the review PR's
// table and reviewed-data file. Code never parses, cleans or reinterprets
// source text or model text: it checks literally what the model returned
// (=== only) and a person reviews every new schedule. No network, no
// database: the core does those, tested end to end by
// scripts/check-import-run.mjs; this file by lib.test.ts.
import { FRACTIONS } from "../../../lib/waste-bin.ts";
import { type Etl, eventId } from "../../lib/import-data.ts";
import type { Layout } from "./prompts.ts";

/** Our month names (the review table and reviewed-data file's keys). */
export const MONTHS = [
  "styczeń",
  "luty",
  "marzec",
  "kwiecień",
  "maj",
  "czerwiec",
  "lipiec",
  "sierpień",
  "wrzesień",
  "październik",
  "listopad",
  "grudzień",
];

/** Each schedule row and the fractions it stands for. */
const GMINA_ROWS: Record<string, string[]> = {
  "zmieszane+bio": ["zmieszane", "bio"],
  selektywne: ["tworzywa_metale", "papier", "szklo"],
  wielkogabarytowe: ["wielkogabarytowe"],
};
/** The city's bands, top to bottom (the order "above" refers to). */
const MIASTO_ROWS: Record<string, string[]> = {
  "zmieszane+popiol": ["zmieszane", "popiol"],
  "papier+tworzywa_metale+szklo": ["papier", "tworzywa_metale", "szklo"],
  bio: ["bio"],
  "wielkogabarytowe+elektro+opony+tekstylia": [
    "wielkogabarytowe",
    "elektro",
    "opony",
    "tekstylia",
  ],
};
export const LAYOUT_ROWS: Record<Layout, Record<string, string[]>> = {
  gmina: GMINA_ROWS,
  miasto: MIASTO_ROWS,
};
const LABELS: Record<string, string> = Object.fromEntries(
  FRACTIONS.map((f) => [f.subtype, f.label]),
);

/** Days per month, per schedule row: rows[row][month 0–11] = [days]. */
export type Rows = Record<string, number[][]>;

// ------------------------------------------------------------------ events

export type SourceRef = { doc: string; url: string; sha256: string };

/**
 * ETL events for one zone and year, exactly as the ETL wrote them for the
 * first import (ids from zone|subtype|date; one event per fraction). Invalid
 * dates and repeats are returned as problems, not events.
 */
export function rowsToEvents(
  zoneId: string,
  year: number,
  rows: Rows,
  fractions: Record<string, string[]>,
  source: SourceRef,
): { events: Etl["events"]; problems: string[] } {
  const events: Etl["events"] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const [row, months] of Object.entries(rows)) {
    const subtypes = fractions[row];
    if (!subtypes) {
      problems.push(`unknown row ${row}`);
      continue;
    }
    months.forEach((days, index) => {
      const month = index + 1;
      for (const day of new Set(days)) {
        const start = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const date = new Date(`${start}T12:00:00Z`);
        if (
          !Number.isInteger(day) ||
          Number.isNaN(date.getTime()) ||
          date.getUTCDate() !== day
        ) {
          problems.push(`${row}: ${day}.${month}.${year} is not a date`);
          continue;
        }
        for (const subtype of subtypes) {
          const key = `${subtype}|${start}`;
          if (seen.has(key)) continue;
          seen.add(key);
          events.push({
            id: eventId(zoneId, subtype, start),
            type: "waste",
            subtype,
            zoneId,
            start,
            allDay: true,
            label: LABELS[subtype] ?? subtype,
            source: {
              doc: source.doc,
              url: source.url,
              ref: `month=${month};row=${row};cell=${day}`,
              sha256: source.sha256,
            },
          });
        }
      }
    });
  }
  return { events, problems };
}

// ------------------------------------------------------------------ holidays

const iso = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: Date, days: number) =>
  new Date(date.getTime() + days * 86_400_000);

/** Easter Sunday (Gregorian, anonymous algorithm). */
function easter(year: number): Date {
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
  return new Date(Date.UTC(year, month - 1, day, 12));
}

/** Polish public holidays (days off work), as ISO dates. */
export function polishHolidays(year: number): Set<string> {
  const fixed = [
    "01-01",
    "01-06",
    "05-01",
    "05-03",
    "08-15",
    "11-01",
    "11-11",
    "12-25",
    "12-26",
  ];
  // Christmas Eve is a day off from 2025.
  if (year >= 2025) fixed.push("12-24");
  const days = new Set(fixed.map((md) => `${year}-${md}`));
  const sunday = easter(year);
  days.add(iso(sunday));
  days.add(iso(addDays(sunday, 1))); // Easter Monday
  days.add(iso(addDays(sunday, 49))); // Pentecost
  days.add(iso(addDays(sunday, 60))); // Corpus Christi
  return days;
}

// ------------------------------------------------------------------ validation

const weekday = (start: string) => new Date(`${start}T12:00:00Z`).getUTCDay();

export type ValidationRules = {
  weekdayShare: number;
  holidayWindowDays: number;
  counts: { factor: number; slack: number };
};

export type ValidationInput = {
  zoneId: string;
  year: number;
  events: Etl["events"];
  /** Enabled checks (etl/sources.yaml, validate): year, weekday, counts. */
  checks: Set<string>;
  rules: ValidationRules;
  /** Events per subtype in the previous year, when it has enough months. */
  previous: Map<string, number> | null;
  /** Approved off-weekday dates, "zoneId|YYYY-MM-DD" (etl/review/approvals.yaml). */
  anomalies: Set<string>;
};

/**
 * Problems that stop an automatic apply: dates outside the schedule year,
 * dates off the sector's usual weekday (unless a public holiday explains the
 * move, or it is an approved anomaly), and counts far from last year's.
 */
export function validateSchedule(input: ValidationInput): string[] {
  const { zoneId, year, events, checks, rules } = input;
  const problems: string[] = [];
  if (events.length === 0) return [`${zoneId}: no dates`];
  if (checks.has("year"))
    for (const e of events) {
      if (!e.start.startsWith(`${year}-`))
        problems.push(`${zoneId}: ${e.start} is outside ${year}`);
    }
  const holidays = new Set([
    ...polishHolidays(year - 1),
    ...polishHolidays(year),
    ...polishHolidays(year + 1),
  ]);
  // Each schedule row keeps its own weekday (bulky waste often differs). A
  // row with no clear one (under weekdayShare on one day) gets the count
  // check only.
  const byRow = new Map<string, Set<string>>();
  for (const e of events) {
    const row = /row=([^;]+)/.exec(e.source.ref ?? "")?.[1] ?? e.subtype;
    byRow.set(row, (byRow.get(row) ?? new Set()).add(e.start));
  }
  for (const [row, set] of checks.has("weekday") ? byRow : []) {
    const dates = [...set].sort();
    const byDay = new Map<number, number>();
    for (const d of dates)
      byDay.set(weekday(d), (byDay.get(weekday(d)) ?? 0) + 1);
    const [usual, count] = [...byDay].sort((x, y) => y[1] - x[1])[0];
    if (count < dates.length * rules.weekdayShare) continue;
    for (const d of dates) {
      if (weekday(d) === usual || input.anomalies.has(`${zoneId}|${d}`))
        continue;
      const date = new Date(`${d}T12:00:00Z`).getTime();
      const explained = [...holidays].some(
        (h) =>
          weekday(h) === usual &&
          Math.abs(new Date(`${h}T12:00:00Z`).getTime() - date) <=
            rules.holidayWindowDays * 86_400_000,
      );
      if (!explained)
        problems.push(
          `${zoneId}: ${d} (${row}) is not on the row's usual weekday and no public holiday explains it`,
        );
    }
  }
  if (input.previous && checks.has("counts")) {
    const { factor, slack } = rules.counts;
    const now = new Map<string, number>();
    for (const e of events) now.set(e.subtype, (now.get(e.subtype) ?? 0) + 1);
    for (const subtype of new Set([...input.previous.keys(), ...now.keys()])) {
      const before = input.previous.get(subtype) ?? 0;
      const after = now.get(subtype) ?? 0;
      if (
        after < Math.floor(before * (1 - factor)) - slack ||
        after > Math.ceil(before * (1 + factor)) + slack
      )
        problems.push(
          `${zoneId}: ${subtype} ${after} dates, ${before} last year (outside the sane range)`,
        );
    }
  }
  return problems;
}

// ------------------------------------------------------------------ the reading

/** A listed place as the model returned it: its words and the id it chose. */
export type Place = { as_written: string; id: string | null };

/** One reading (Grok's reply, or a merged review), its rows by month. */
export type Reading = {
  sector: number | null;
  year: number;
  /** The month headers as read (a merged review has none). */
  months: string[];
  places: Place[];
  rows: Rows;
  unplaced: Array<{ row: string; day: number }>;
};

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isDay = (value: unknown): value is number => Number.isInteger(value);

/** Exactly these keys: one finding per missing or extra key. */
function keyFindings(value: Json, keys: string[], at: string): string[] {
  const findings: string[] = [];
  for (const key of keys)
    if (!Object.hasOwn(value, key)) findings.push(`${at}: no key "${key}"`);
  for (const key of Object.keys(value))
    if (!keys.includes(key))
      findings.push(`${at}: unexpected key ${JSON.stringify(key)}`);
  return findings;
}

/** Sector and year against the file name's (sector null for the gmina). */
function fileFindings(
  value: Json,
  layout: Layout,
  file: { sector: number; year: number },
): string[] {
  const findings: string[] = [];
  if (layout === "gmina" && value.sector !== null)
    findings.push(
      `sector ${JSON.stringify(value.sector)}, expected null (the gmina PDFs print no sector)`,
    );
  if (layout === "miasto" && value.sector !== file.sector)
    findings.push(
      `sector ${JSON.stringify(value.sector)}, the file name says ${file.sector}`,
    );
  if (value.year !== file.year)
    findings.push(
      `year ${JSON.stringify(value.year)}, the file name says ${file.year}`,
    );
  return findings;
}

/** Places' shape: a list of {as_written: string, id: string | null}. */
function placeShape(places: unknown): string[] {
  if (!Array.isArray(places)) return ["places: not a list"];
  const findings: string[] = [];
  places.forEach((place, i) => {
    const at = `places[${i}]`;
    if (!isObject(place)) {
      findings.push(`${at}: not an object`);
      return;
    }
    findings.push(...keyFindings(place, ["as_written", "id"], at));
    if (typeof place.as_written !== "string")
      findings.push(`${at}: as_written is not a string`);
    if (place.id !== null && typeof place.id !== "string")
      findings.push(`${at}: id is not a string or null`);
  });
  return findings;
}

/** Places' values: as_written non-empty, id null or one of the list sent. */
function placeValues(places: Place[], ids: string[]): string[] {
  const findings: string[] = [];
  places.forEach((place, i) => {
    if (place.as_written === "")
      findings.push(`places[${i}]: as_written is empty`);
    if (place.id !== null && !ids.includes(place.id))
      findings.push(
        `places[${i}] ${JSON.stringify(place.as_written)}: id ${JSON.stringify(place.id)} is not in the list sent`,
      );
  });
  return findings;
}

const emptyRows = (rowNames: string[]): Rows =>
  Object.fromEntries(
    rowNames.map((row) => [row, Array.from({ length: 12 }, () => [])]),
  );
const sortDays = (rows: Rows) => {
  for (const months of Object.values(rows))
    months.forEach((days, i) => {
      months[i] = [...new Set(days)].sort((a, b) => a - b);
    });
  return rows;
};

/**
 * Grok's reply, checked literally against the layout's shape (the prompt
 * files') and against itself: JSON.parse as given, exact keys and types,
 * month_header === months[month - 1], each city "above" a date of the band
 * above in that month, ids only from the list sent, sector and year as the
 * file name says, unplaced empty. Every finding is for the review PR; none
 * is ever fixed here. reading is null when the reply has not the shape.
 */
export function checkReply(
  content: string,
  layout: Layout,
  ids: string[],
  file: { sector: number; year: number },
): { reading: Reading | null; findings: string[] } {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    return { reading: null, findings: ["reply is not JSON"] };
  }
  if (!isObject(value))
    return { reading: null, findings: ["reply is not a JSON object"] };
  const rowNames = Object.keys(LAYOUT_ROWS[layout]);
  const entryKeys =
    layout === "miasto"
      ? ["month", "month_header", "above", "day"]
      : ["month", "month_header", "day"];
  const keys = ["sector", "year", "months", "places", "rows", "unplaced"];
  const shape = keyFindings(value, keys, "reply");
  if (shape.length) return { reading: null, findings: shape };

  // The shape: types only.
  if (value.sector !== null && !Number.isInteger(value.sector))
    shape.push("sector: not an integer or null");
  if (!Number.isInteger(value.year)) shape.push("year: not an integer");
  const months = value.months;
  if (
    !Array.isArray(months) ||
    months.length !== 12 ||
    !months.every((m) => typeof m === "string")
  )
    shape.push("months: not 12 strings");
  shape.push(...placeShape(value.places));
  const rows = value.rows;
  if (!isObject(rows)) shape.push("rows: not an object");
  else {
    shape.push(...keyFindings(rows, rowNames, "rows"));
    for (const row of rowNames) {
      const entries = rows[row];
      if (!Array.isArray(entries)) {
        if (Object.hasOwn(rows, row)) shape.push(`rows.${row}: not a list`);
        continue;
      }
      entries.forEach((entry, i) => {
        const at = `rows.${row}[${i}]`;
        if (!isObject(entry)) {
          shape.push(`${at}: not an object`);
          return;
        }
        shape.push(...keyFindings(entry, entryKeys, at));
        if (
          !Number.isInteger(entry.month) ||
          (entry.month as number) < 1 ||
          (entry.month as number) > 12
        )
          shape.push(`${at}: month is not an integer 1–12`);
        if (typeof entry.month_header !== "string")
          shape.push(`${at}: month_header is not a string`);
        if (!isDay(entry.day)) shape.push(`${at}: day is not an integer`);
        if (
          layout === "miasto" &&
          Object.hasOwn(entry, "above") &&
          entry.above !== null &&
          !isDay(entry.above)
        )
          shape.push(`${at}: above is not an integer or null`);
      });
    }
  }
  const unplaced = value.unplaced;
  if (!Array.isArray(unplaced)) shape.push("unplaced: not a list");
  else
    unplaced.forEach((u, i) => {
      const at = `unplaced[${i}]`;
      if (!isObject(u)) {
        shape.push(`${at}: not an object`);
        return;
      }
      shape.push(...keyFindings(u, ["row", "day"], at));
      if (typeof u.row !== "string") shape.push(`${at}: row is not a string`);
      if (!isDay(u.day)) shape.push(`${at}: day is not an integer`);
    });
  if (shape.length) return { reading: null, findings: shape };

  // The values, each against the file or against the reply itself.
  const findings = [
    ...fileFindings(value, layout, file),
    ...placeValues(value.places as Place[], ids),
  ];
  type Entry = {
    month: number;
    month_header: string;
    above?: number | null;
    day: number;
  };
  const bands = rows as Record<string, Entry[]>;
  const headers = months as string[];
  const built = emptyRows(rowNames);
  rowNames.forEach((row, band) => {
    for (const e of bands[row]) {
      const at = `${row}, month ${e.month}, day ${e.day}`;
      if (e.month_header !== headers[e.month - 1])
        findings.push(
          `${at}: month_header ${JSON.stringify(e.month_header)} is not months[${e.month - 1}] ${JSON.stringify(headers[e.month - 1])}`,
        );
      if (layout === "miasto") {
        if (band === 0 && e.above !== null)
          findings.push(`${at}: above is ${e.above} in the top band`);
        if (
          band > 0 &&
          e.above !== null &&
          !bands[rowNames[band - 1]].some(
            (u) => u.month === e.month && u.day === e.above,
          )
        )
          findings.push(
            `${at}: above ${e.above} is not a date of ${rowNames[band - 1]} in that month`,
          );
      }
      built[row][e.month - 1].push(e.day);
    }
  });
  const left = unplaced as Reading["unplaced"];
  for (const u of left)
    findings.push(`unplaced: ${JSON.stringify(u.row)}, day ${u.day}`);
  return {
    reading: {
      sector: value.sector as number | null,
      year: value.year as number,
      months: headers,
      places: value.places as Place[],
      rows: sortDays(built),
      unplaced: left,
    },
    findings,
  };
}

/**
 * The places read against the zone's members in the database, by id only:
 * on the file but not in the zone, in the zone but not on the file, and
 * places with no id (never guessed). The import never changes membership.
 */
export function memberLists(
  places: Place[],
  members: Array<{ id: string; name: string }>,
): {
  notInZone: Place[];
  notOnFile: Array<{ id: string; name: string }>;
  noId: Place[];
} {
  return {
    notInZone: places.filter(
      (p) => p.id !== null && !members.some((m) => m.id === p.id),
    ),
    notOnFile: members.filter((m) => !places.some((p) => p.id === m.id)),
    noId: places.filter((p) => p.id === null),
  };
}

// ------------------------------------------------------------------ review PRs

const days = (list: number[] | undefined) =>
  list?.length ? list.join(", ") : "—";
const sameDays = (a: number[] = [], b: number[] = []) =>
  a.length === b.length && a.every((d, i) => d === b[i]);

/** Days per row and month already in the database (each row's first fraction). */
export function databaseRows(
  events: Array<{ subtype: string; start: string }>,
  fractions: Record<string, string[]>,
): Rows {
  const rows: Rows = {};
  for (const [row, subtypes] of Object.entries(fractions)) {
    rows[row] = Array.from({ length: 12 }, () => []);
    for (const e of events)
      if (e.subtype === subtypes[0])
        rows[row][Number(e.start.slice(5, 7)) - 1].push(
          Number(e.start.slice(8, 10)),
        );
    for (const month of rows[row]) month.sort((a, b) => a - b);
  }
  return rows;
}

/**
 * A review PR's table (Polish markdown): every row and month, the reading's
 * days and the database's, each difference marked; the month header as read.
 */
export function readingTable(reading: Reading | null, current: Rows): string {
  const lines = [
    "| Wiersz | Miesiąc | Nagłówek z odczytu | odczyt | w bazie | |",
    "|---|---|---|---|---|---|",
  ];
  for (const row of Object.keys(current))
    MONTHS.forEach((month, i) => {
      const read = reading?.rows[row]?.[i];
      const differs = !reading || !sameDays(read, current[row][i]);
      lines.push(
        `| ${row} | ${month} | ${reading?.months[i] ?? ""} | ${reading ? days(read) : "?"} | ${days(current[row][i])} | ${differs ? "**różnica**" : ""} |`,
      );
    });
  return lines.join("\n");
}

const REVIEWED_KEYS = [
  "sha256",
  "file",
  "from",
  "sector",
  "year",
  "rows",
  "places",
];

/**
 * The reviewed-data file a review PR proposes (YAML, easy to edit by hand):
 * the reading's dates, sector and year, and its places as returned. With no
 * reading (a reply without the shape): the file name's sector and year, no
 * dates, for the person to fill in.
 */
export function reviewedYaml(
  reading: Reading | null,
  layout: Layout,
  file: { name: string; sector: number; year: number },
  model: string,
  digest: string,
): string {
  const rows = reading?.rows ?? emptyRows(Object.keys(LAYOUT_ROWS[layout]));
  return [
    `# Przejrzane daty z pliku ${file.name}, wstępnie z odczytu ${model}${reading ? "" : " (odczyt bez wymaganego kształtu: daty do wpisania)"}.`,
    "# Porównaj z obrazem i popraw dni miesiąca, jeśli trzeba. Scalenie PR",
    "# zatwierdza je dla pliku o tym sha256. places to tylko informacja,",
    "# skopiowana z odczytu: przynależność do stref bierze się wyłącznie z bazy.",
    `sha256: ${digest}`,
    `file: ${JSON.stringify(file.name)}`,
    `from: ${JSON.stringify(model)}`,
    `sector: ${JSON.stringify(reading ? reading.sector : layout === "gmina" ? null : file.sector)}`,
    `year: ${JSON.stringify(reading ? reading.year : file.year)}`,
    "rows:",
    ...Object.entries(rows).flatMap(([row, months]) => [
      `  ${JSON.stringify(row)}:`,
      ...months.map((d, i) => `    ${MONTHS[i]}: [${d.join(", ")}]`),
    ]),
    `places:${reading?.places.length ? "" : " []"}`,
    ...(reading?.places ?? []).map(
      (p) =>
        `  - { as_written: ${JSON.stringify(p.as_written)}, id: ${JSON.stringify(p.id)} }`,
    ),
    "",
  ].join("\n");
}

/**
 * A merged reviewed-data file as a reading, with the same literal checks as
 * a reply: exact keys, sector and year as the file name says, every month
 * of every row a list of integer days, places as returned (ids from the
 * list sent). Findings block it (an issue), never fixed here.
 */
export function parseReviewed(
  value: unknown,
  layout: Layout,
  ids: string[],
  file: { sector: number; year: number },
): { reading: Reading | null; findings: string[] } {
  if (!isObject(value))
    return { reading: null, findings: ["reviewed: not an object"] };
  const findings = keyFindings(value, REVIEWED_KEYS, "reviewed");
  findings.push(...fileFindings(value, layout, file));
  const places = placeShape(value.places);
  findings.push(
    ...places,
    ...(places.length ? [] : placeValues(value.places as Place[], ids)),
  );
  const rowNames = Object.keys(LAYOUT_ROWS[layout]);
  const rows = emptyRows(rowNames);
  if (!isObject(value.rows)) findings.push("rows: not an object");
  else {
    findings.push(...keyFindings(value.rows, rowNames, "rows"));
    for (const row of rowNames) {
      const months = value.rows[row];
      if (!isObject(months)) {
        findings.push(`rows.${row}: not an object`);
        continue;
      }
      findings.push(...keyFindings(months, MONTHS, `rows.${row}`));
      MONTHS.forEach((month, i) => {
        const list = months[month];
        if (!Array.isArray(list) || !list.every(isDay))
          findings.push(`rows.${row}.${month}: not a list of integer days`);
        else rows[row][i].push(...list);
      });
    }
  }
  if (findings.length) return { reading: null, findings };
  return {
    reading: {
      sector: value.sector as number | null,
      year: value.year as number,
      months: [],
      places: value.places as Place[],
      rows: sortDays(rows),
      unplaced: [],
    },
    findings,
  };
}
