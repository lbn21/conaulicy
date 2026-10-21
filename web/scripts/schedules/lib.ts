// The pure parts of the unattended schedule import (docs/import-schedules.md):
// parsing, events, validation, comparing vision passes, diffing rows. No
// network, no database: run.ts does those, tested end to end by
// scripts/check-import-schedules.mjs; this file by lib.test.ts.
import { type Etl, eventId } from "../lib/import-data.ts";

export const MONTHS = [
  "STYCZEŃ",
  "LUTY",
  "MARZEC",
  "KWIECIEŃ",
  "MAJ",
  "CZERWIEC",
  "LIPIEC",
  "SIERPIEŃ",
  "WRZESIEŃ",
  "PAŹDZIERNIK",
  "LISTOPAD",
  "GRUDZIEŃ",
];

/** Each schedule row and the fractions it stands for. */
export const GMINA_ROWS: Record<string, string[]> = {
  "zmieszane+bio": ["zmieszane", "bio"],
  selektywne: ["tworzywa_metale", "papier", "szklo"],
  wielkogabarytowe: ["wielkogabarytowe"],
};
export const MIASTO_ROWS: Record<string, string[]> = {
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
export const LABELS: Record<string, string> = {
  zmieszane: "Zmieszane",
  popiol: "Popiół",
  bio: "Bio",
  papier: "Papier",
  tworzywa_metale: "Tworzywa sztuczne i metale",
  szklo: "Szkło",
  wielkogabarytowe: "Wielkogabarytowe",
  elektro: "Elektryczne i elektroniczne",
  opony: "Zużyte opony",
  tekstylia: "Odzież i tekstylia",
};

/** Days per month, per schedule row: rows[row][month 0–11] = [days]. */
export type Rows = Record<string, number[][]>;

// ------------------------------------------------------------------ gmina

const MONTH_RE = new RegExp(
  `(?<!\\p{L})(?:${MONTHS.join("|")})(?!\\p{L})`,
  "u",
);
const DATE_RE = /(?<![\d,])(?:\d{1,2}(?:,\d{1,2})*|-)(?![\d,])/g;

/**
 * A gmina PDF's text layer (pdftotext -layout): the places in the left
 * column and three date columns per month. "-" is no date, "2,20" two.
 * Throws with the reason when the layout is not the expected one.
 */
export function parseGminaLayout(text: string): {
  places: string[];
  rows: Rows;
} {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(
    (line) => line.includes("MIEJSCOWOŚCI") && line.includes("MIESIĄC"),
  );
  if (start < 0) throw new Error("no header row (MIEJSCOWOŚCI … MIESIĄC)");
  const fragments: string[] = [];
  const found = new Map<string, string[]>();
  for (const line of lines.slice(start + 1)) {
    if (line.includes("WSZYSTKIE")) break;
    const match = MONTH_RE.exec(line);
    if (!match) {
      if (line.trim()) fragments.push(line.trim());
      continue;
    }
    const left = line.slice(0, match.index).trim();
    if (left) fragments.push(left);
    const tokens =
      line.slice(match.index + match[0].length).match(DATE_RE) ?? [];
    if (tokens.length !== 3) {
      throw new Error(`${match[0]}: ${tokens.length} date columns, expected 3`);
    }
    found.set(match[0], tokens);
  }
  const missing = MONTHS.filter((month) => !found.has(month));
  if (missing.length > 0)
    throw new Error(`missing months: ${missing.join(", ")}`);
  const days = (token: string) =>
    token === "-" ? [] : token.split(",").map((part) => Number(part));
  const names = Object.keys(GMINA_ROWS);
  const rows: Rows = {};
  names.forEach((name, column) => {
    rows[name] = MONTHS.map((month) => days((found.get(month) ?? [])[column]));
  });
  const places = fragments
    .join(" ")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return { places, rows };
}

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

/** Names compared without case, diacritics, punctuation (ł → l). */
export function fold(value: string): string {
  return value
    .replaceAll("ł", "l")
    .replaceAll("Ł", "L")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// Street types and ranks the schedules and TERYT spell differently, or omit.
const RANKS = new Set([
  "ul",
  "al",
  "pl",
  "gen",
  "ks",
  "mjr",
  "rtm",
  "plk",
  "pplk",
  "kard",
  "abp",
  "arcybiskupa",
  "prof",
  "dr",
  "het",
  "sw",
  "ksiecia",
  "wojewody",
]);

/** A street name as the schedules and TERYT can both be matched on. */
export function streetKey(value: string): string {
  const kept: string[] = [];
  for (const part of fold(value).split(" ")) {
    if (!part || RANKS.has(part) || (part.length === 1 && /\p{L}/u.test(part)))
      continue;
    if ((part === "go" || part === "ego") && /^\d+$/.test(kept.at(-1) ?? ""))
      continue;
    kept.push(part);
  }
  return kept.join(" ");
}

/** Places or streets the source lists against the zone's members now. */
export function compareMembers(
  zoneId: string,
  listed: string[],
  members: Array<{ id: string; names: string[] }>,
  key: (name: string) => string,
  aliases: Record<string, string> = {},
): string[] {
  const problems: string[] = [];
  const matched = new Set<string>();
  for (const name of listed) {
    const k = key(aliases[name] ?? name);
    // An exact match wins over a longer name ending in it (Mazury, Boczna Mazury).
    const exact = members.filter((m) => m.names.some((n) => key(n) === k));
    const hits = exact.length
      ? exact
      : members.filter((m) => m.names.some((n) => key(n).endsWith(` ${k}`)));
    if (hits.length === 1) matched.add(hits[0].id);
    else
      problems.push(
        `${zoneId}: „${name}” ${hits.length === 0 ? "is not a member now" : "matches several members"}`,
      );
  }
  for (const m of members) {
    if (!matched.has(m.id))
      problems.push(`${zoneId}: „${m.names[0]}” is no longer listed`);
  }
  return problems;
}

// ------------------------------------------------------------------ vision passes

export type VisionReading = {
  sector: number;
  year: number;
  streets: string[];
  rows: Rows;
};

/**
 * The first balanced top-level JSON object in a model's reply, which may wrap
 * it in prose or a ```json fence. Braces inside strings (and escaped quotes)
 * do not count. Throws if there is none.
 */
export function extractJson(text: string): string {
  const start = text.indexOf("{");
  if (start < 0) throw new Error("no JSON object in the reply");
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  throw new Error("the JSON object in the reply is not closed");
}

/**
 * One vision pass's JSON, checked against the strict schema: exactly these
 * keys, 12 months per row, days 1–31 as integers. Throws with the reason.
 */
export function parseVisionJson(
  text: string,
  rowNames: string[],
): VisionReading {
  const value = JSON.parse(extractJson(text)) as Record<string, unknown>;
  const keys = Object.keys(value).sort().join(",");
  if (keys !== "rows,sector,streets,year")
    throw new Error(`keys ${keys}, expected rows, sector, streets, year`);
  const { sector, year, streets, rows } = value as {
    sector: unknown;
    year: unknown;
    streets: unknown;
    rows: Record<string, unknown>;
  };
  if (!Number.isInteger(sector) || !Number.isInteger(year))
    throw new Error("sector and year must be integers");
  if (
    !Array.isArray(streets) ||
    !streets.every((s) => typeof s === "string" && s.trim())
  )
    throw new Error("streets must be non-empty strings");
  if (
    Object.keys(rows ?? {})
      .sort()
      .join(",") !== [...rowNames].sort().join(",")
  )
    throw new Error(`rows must be exactly: ${rowNames.join(", ")}`);
  const parsed: Rows = {};
  for (const name of rowNames) {
    const months = rows[name];
    if (!Array.isArray(months) || months.length !== 12)
      throw new Error(`${name}: 12 months expected`);
    parsed[name] = months.map((days, i) => {
      if (
        !Array.isArray(days) ||
        !days.every((d) => Number.isInteger(d) && d >= 1 && d <= 31)
      )
        throw new Error(`${name}, month ${i + 1}: days must be integers 1–31`);
      return [...new Set(days as number[])].sort((a, b) => a - b);
    });
  }
  return {
    sector: sector as number,
    year: year as number,
    streets: (streets as string[]).map((s) => s.trim()).sort(),
    rows: parsed,
  };
}

/**
 * Every difference in sector, year and dates between two readings; empty
 * when they agree 100%. Streets are not compared: the database owns them
 * (streetReview).
 */
export function compareReadings(a: VisionReading, b: VisionReading): string[] {
  const diffs: string[] = [];
  if (a.sector !== b.sector) diffs.push(`sector: ${a.sector} vs ${b.sector}`);
  if (a.year !== b.year) diffs.push(`year: ${a.year} vs ${b.year}`);
  for (const row of Object.keys(a.rows)) {
    a.rows[row].forEach((days, i) => {
      const other = b.rows[row]?.[i] ?? [];
      if (days.join(",") !== other.join(","))
        diffs.push(
          `${row}, ${MONTHS[i].toLowerCase()}: [${days.join(", ")}] vs [${other.join(", ")}]`,
        );
    });
  }
  return diffs;
}

/**
 * Each pass's street list against the zone's streets in the database
 * (compareMembers, streetKey only). Model spelling is never applied; any
 * difference is for a person to check. Empty when every pass matches.
 */
export function streetReview(
  zoneId: string,
  readings: string[][],
  members: Array<{ id: string; names: string[] }>,
  aliases: Record<string, string> = {},
): string[] {
  const passes = new Map<string, number[]>();
  readings.forEach((streets, i) => {
    for (const p of compareMembers(
      zoneId,
      streets,
      members,
      streetKey,
      aliases,
    ))
      passes.set(p, [...(passes.get(p) ?? []), i + 1]);
  });
  return [...passes].map(([p, n]) => `${p} (pass ${n.join(", ")})`);
}

// ------------------------------------------------------------------ diff

export type EventRow = Record<string, unknown> & { id: string };

/** Columns compared between the database and a new import. */
export const EVENT_COLUMNS = [
  "type",
  "subtype",
  "zoneId",
  "start",
  "end",
  "allDay",
  "label",
  "sourceDoc",
  "sourceUrl",
  "sourceRef",
  "sourceSha256",
  "checkedAt",
  "verified",
  "reviewedBy",
  "shiftedFrom",
  "payload",
] as const;

const stable = (value: unknown): string =>
  JSON.stringify(value, (_, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v).sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  ) ?? "null";

export function diffEvents(current: EventRow[], next: EventRow[]) {
  const before = new Map(current.map((r) => [r.id, r]));
  const after = new Map(next.map((r) => [r.id, r]));
  const added = next.filter((r) => !before.has(r.id));
  const removed = current.filter((r) => !after.has(r.id));
  const changed: Array<{
    before: EventRow;
    after: EventRow;
    columns: string[];
  }> = [];
  for (const row of next) {
    const old = before.get(row.id);
    if (!old) continue;
    const columns = EVENT_COLUMNS.filter(
      (c) => stable(old[c] ?? null) !== stable(row[c] ?? null),
    );
    if (columns.length) changed.push({ before: old, after: row, columns });
  }
  return { added, removed, changed };
}

// ------------------------------------------------------------------ coverage

/**
 * Zones whose last date is closer than minDays (or that have none): the next
 * schedule is late. The dead-man switch's single issue lists them.
 */
export function coverageGaps(
  lastDates: Array<{ zoneId: string; last: string | null }>,
  today: string,
  minDays: number,
): string[] {
  const limit = new Date(`${today}T12:00:00Z`).getTime() + minDays * 86_400_000;
  return lastDates
    .filter((z) => !z.last || new Date(`${z.last}T12:00:00Z`).getTime() < limit)
    .map((z) => `${z.zoneId}: ${z.last ? `last date ${z.last}` : "no dates"}`);
}
