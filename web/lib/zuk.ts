// Water cuts announced by Zakład Usług Komunalnych w Mokrzycy (ZUK), posted
// on the gmina's site (https://www.gminalubaczow.pl, WordPress REST API).
// Pure: the caller fetches the posts and passes the response body, our
// places and the fetch time. A wrong date is the worst outcome and a link is
// always acceptable, so a notice becomes a Disruption only when every guard
// passes; any doubt makes it a Notice (lib/disruptions.ts). Guards:
// - title-date: the date(s) in the title equal the date(s) in the body;
// - weekday: every date in the body names its weekday, "(wtorek)", and it
//   matches the date;
// - window: every date is between the post's day and 14 days later;
// - time: one window per day, start < end, 05:00 to 22:00;
// - place: every place resolves to exactly one of our localities or streets
//   (TERYT names; the source is mapped to TERYT, never the other way);
// - tense, change, structure: a planned cut ("nastąpi"), not a failure
//   report, a date change or a layout we do not know.
// The formats ZUK uses: lib/zuk-fixture.ts.

import { addDays, warsawToIso } from "./dates.ts";
import type {
  Disruption,
  DisruptionPlace,
  DisruptionScope,
  DisruptionSource,
  Notice,
} from "./disruptions.ts";
import { normalize } from "./normalize.ts";

const SOURCE_NAME = "Zakład Usług Komunalnych w Mokrzycy";

/** A post as the WordPress REST API returns it: the fields we read. */
export type ZukPost = {
  id: number;
  /** Site time (Warsaw), "2026-10-23T18:59:43". */
  date: string;
  modified: string;
  link: string;
  title: { rendered: string };
  content: { rendered: string };
};

/** Our places, as the database holds them (TERYT names). */
export type ZukPlaces = {
  localities: Array<{ id: string; name: string }>;
  streets: Array<{
    id: string;
    localityId: string;
    /** NAZWA_2 NAZWA_1, "Jana III Sobieskiego". */
    name: string;
    nazwa1: string | null;
  }>;
};

export type ZukResult = { disruptions: Disruption[]; notices: Notice[] };

export type Doubt =
  | "title-date"
  | "weekday"
  | "window"
  | "time"
  | "place"
  | "tense"
  | "change"
  | "structure";

type Classified =
  | { post: ZukPost; disruptions: Disruption[] }
  | { post: ZukPost; notice: Notice; doubt: Doubt };

// "22.10.2026r. (czwartek)", "16.12.2025 (wtorek)", "1.09.2025 r.".
const DATE = /(\d{1,2})\.(\d{1,2})\.(\d{4})\s*(?:r\.?)?\s*(?:\(([^)]*)\))?/g;
// "26-29.10.2026", "7-8.09.2026", "22.10.2026": in titles only.
const TITLE_DATE = /(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\.(\d{1,2})\.(\d{4})/g;
const TIME = String.raw`(\d{1,2})[:.](\d{2})`;
// "w godz. od 8:00 do godz. 16:00", "w godz. – od 8:00 do 12:00",
// "– od 8:00 do 16:00", "w godzinach 9.00 – 15.00".
const WINDOW = new RegExp(
  String.raw`(?:w\s+godz(?:\.|inach)?\s*[–-]?\s*)?(?:od\s+)?(?:godz\.?\s*)?${TIME}\s*(?:[–-]|do)\s*(?:godz\.?\s*)?${TIME}`,
  "g",
);
const WEEKDAYS = [
  "niedziela",
  "poniedziałek",
  "wtorek",
  "środa",
  "czwartek",
  "piątek",
  "sobota",
];
const PLANNED = /nastąpi przerwa w dostawie wody/i;
const CHANGE =
  /aktualizac|zmian\p{L}* (?:termin|dat|dni)|wydłuż|przesun|przełoż/iu;
const REVOKED = /odwoł/i;
const STREET_MARK = String.raw`(?:ul\.|ulica|ulice:?|os\.|al\.)`;
// Words that end an abbreviation, not a sentence: "ul. Polna".
const ABBREVIATIONS = new Set(["ul", "os", "al", "pl", "nr", "św", "gen"]);

const ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  quot: '"',
  lt: "<",
  gt: ">",
};

function text(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (all, name) => ENTITIES[name] ?? all)
    .replace(/\s+/g, " ")
    .trim();
}

function blocks(html: string, tag: "p" | "li"): string[] {
  return [
    ...html.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "gi")),
  ]
    .map((m) => text(m[1]))
    .filter(Boolean);
}

const wall = (wp: string) => wp.replace("T", " ").slice(0, 19);

function isoDate(d: string, m: string, y: string): string | null {
  const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const date = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso
    ? null
    : iso;
}

type Dated = { iso: string; weekday: string | undefined };

function datesIn(line: string): Array<Dated | null> {
  return [...line.matchAll(DATE)].map((m) => {
    const iso = isoDate(m[1], m[2], m[3]);
    return iso ? { iso, weekday: m[4] } : null;
  });
}

function weekdayMatches({ iso, weekday }: Dated): boolean {
  const day = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return (
    weekday !== undefined && normalize(weekday) === normalize(WEEKDAYS[day])
  );
}

function titleDates(title: string): Set<string> | null {
  const dates = new Set<string>();
  for (const m of title.matchAll(TITLE_DATE)) {
    const first = Number(m[1]);
    const last = m[2] ? Number(m[2]) : first;
    if (last < first) return null;
    for (let day = first; day <= last; day++) {
      const iso = isoDate(String(day), m[3], m[4]);
      if (!iso) return null;
      dates.add(iso);
    }
  }
  return dates;
}

type Window = { from: string; to: string };

const hhmm = (h: string, m: string) => `${h.padStart(2, "0")}:${m}`;

/** The time windows in a line (dates taken out first), and the rest. */
function windowsIn(line: string): { windows: Window[]; rest: string } {
  const undated = line.replace(DATE, " ");
  const windows = [...undated.matchAll(WINDOW)].map((m) => ({
    from: hhmm(m[1], m[2]),
    to: hhmm(m[3], m[4]),
  }));
  return { windows, rest: undated.replace(WINDOW, " ") };
}

function saneWindow({ from, to }: Window): boolean {
  const valid = (t: string) =>
    Number(t.slice(0, 2)) < 24 && Number(t.slice(3)) < 60;
  return (
    valid(from) && valid(to) && from >= "05:00" && to <= "22:00" && from < to
  );
}

/** Text up to the first full stop that ends a sentence (not "ul."). */
function firstSentence(line: string): string {
  for (const m of line.matchAll(/\.(?=\s|$)/g)) {
    const word = /(\S+)$/.exec(line.slice(0, m.index))?.[1] ?? "";
    if (!ABBREVIATIONS.has(word.toLowerCase())) return line.slice(0, m.index);
  }
  return line;
}

const tidy = (places: string) =>
  places.replace(/\s+/g, " ").replace(/^[\s–:-]+|[\s–:.-]+$/g, "");

type Item = { dates: string[]; window: Window; where: string };

/** The days, windows and place lists of a post, or why we doubt it. */
function readItems(paragraphs: string[], items: string[]): Item[] | Doubt {
  const intros = paragraphs.filter((p) => PLANNED.test(p));
  if (intros.length !== 1) return "structure";
  const intro = intros[0];
  if (/w nocy/i.test(intro)) return "structure";
  const introDates = datesIn(intro).map((d) => d?.iso ?? "");
  const introWindows = windowsIn(intro).windows;

  if (items.length === 0) {
    // One sentence: "w dniu D (…) w godz. … nastąpi przerwa … miejscowości: …".
    if (/w dniach\s*:?\s*od\b/i.test(intro)) return "structure";
    if (introDates.length === 0) return "structure";
    if (introWindows.length !== 1) return "time";
    const after = /miejscowości\s*:?\s*(.*)$/i.exec(intro)?.[1];
    if (!after) return "structure";
    const where = tidy(windowsIn(firstSentence(after)).rest);
    return [{ dates: introDates, window: introWindows[0], where }];
  }

  // A list: each item a place list with its window, and its own date when
  // the intro gives a range ("-26.10.2026 (poniedziałek): Lisie Jamy …").
  const read: Item[] = [];
  for (const item of items) {
    const lead =
      /^[-–]?\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s*(?:r\.?)?\s*\([^)]*\)\s*:?/.exec(
        item,
      );
    const own = lead ? isoDate(lead[1], lead[2], lead[3]) : null;
    if (lead && !own) return "structure";
    const dates = own ? [own] : introDates;
    if (dates.length !== 1) return "structure";
    const { windows, rest } = windowsIn(
      lead ? item.slice(lead[0].length) : item,
    );
    if (windows.length > 1 || (windows.length === 1 && introWindows.length > 0))
      return "time";
    const window = windows[0] ?? introWindows[0];
    if (!window || introWindows.length > 1) return "time";
    read.push({ dates, window, where: tidy(rest) });
  }
  // The intro's range ends are the first and last item days.
  const itemDays = read.flatMap((i) => i.dates).sort();
  if (introDates.some((d) => !itemDays.includes(d))) return "structure";
  const [first, last] = [itemDays[0], itemDays[itemDays.length - 1]];
  if (
    introDates.length === 2 &&
    (first < introDates[0] || last > introDates[1])
  )
    return "structure";
  return read;
}

type Resolved = { place: DisruptionPlace; scope: DisruptionScope };

/** A place name as a regex source: literal, any run of spaces. */
function namePattern(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
}

/** Our street in a locality whose TERYT name ends with the source's name. */
function street(
  places: ZukPlaces,
  localityId: string,
  name: string,
): string | null {
  const n = normalize(name);
  if (!n) return null;
  const hits = places.streets.filter((s) => {
    if (s.localityId !== localityId) return false;
    const full = normalize(s.name);
    return (
      full === n || normalize(s.nazwa1 ?? "") === n || full.endsWith(` ${n}`)
    );
  });
  return hits.length === 1 ? hits[0].id : null;
}

function scopeOf(
  token: string,
): { name: string; scope: DisruptionScope } | null {
  const range =
    /\s+od\s+(?:nr|numeru)?\s*(\d{1,4}[a-z]?)\s+do\s+(?:nr|numeru)?\s*(\d{1,4}[a-z]?)$/i.exec(
      token,
    );
  if (range) {
    if (Number.parseInt(range[1], 10) > Number.parseInt(range[2], 10))
      return null;
    return {
      name: token.slice(0, range.index),
      scope: { type: "range", from: range[1], to: range[2], parity: null },
    };
  }
  const one = /\s+(?:nr|numer)\s+(\d{1,4}[a-z]?)$/i.exec(token);
  if (one)
    return {
      name: token.slice(0, one.index),
      scope: { type: "numbers", numbers: [one[1]] },
    };
  const part = /^(?:w\s+)?częś(?:ć|ci)\s+(?:miejscowości\s+)?/i.exec(token);
  if (part)
    return { name: token.slice(part[0].length), scope: { type: "unknown" } };
  return { name: token, scope: { type: "whole" } };
}

/**
 * A place list as ZUK writes it, resolved to our places: "Wólka Krowicka,
 * Karolówka – ul. Sobieskiego od nr 23 do nr 47, Młodów – ul. Warszawska,
 * Rzeczna". Null on any doubt: an unknown or repeated name, brackets,
 * numbers we cannot read, or "Młodów, ul. Pilipy" (the whole village, or
 * only its street?).
 */
function resolvePlaces(where: string, places: ZukPlaces): Resolved[] | null {
  if (!where || /[()]/.test(where)) return null;
  const resolved: Resolved[] = [];
  let context: { localityId: string; streets: boolean } | null = null;
  for (const token of where.split(/\s*,\s*|\s+oraz\s+|\s+i\s+/)) {
    const scoped = scopeOf(token.trim());
    if (!scoped) return null;
    const { name, scope } = scoped;
    if (/(?<![\p{L}\d])(?:nr|numer\p{L}*|od|do|dz)(?!\p{L})|\d/iu.test(name))
      return null;

    const marked = new RegExp(`^${STREET_MARK}\\s*(.+)$`, "i").exec(name);
    if (marked) {
      // "ul. Pilipy" right after a bare village: ambiguous.
      if (!context?.streets) return null;
      const id = street(places, context.localityId, marked[1]);
      if (!id) return null;
      resolved.push({
        place: { localityId: context.localityId, streetId: id },
        scope,
      });
      continue;
    }

    const localities = places.localities.flatMap((l) => {
      const m = new RegExp(
        `^(${namePattern(l.name)})(?=$|[\\s:–-])(.*)$`,
        "iu",
      ).exec(name);
      return m ? [{ id: l.id, length: m[1].length, rest: m[2] }] : [];
    });
    const longest = Math.max(0, ...localities.map((l) => l.length));
    const named = localities.filter((l) => l.length === longest);
    const asStreet = context?.streets
      ? street(places, context.localityId, name)
      : null;

    if (named.length === 0) {
      if (!asStreet || !context) return null;
      resolved.push({
        place: { localityId: context.localityId, streetId: asStreet },
        scope,
      });
      continue;
    }
    if (named.length > 1 || asStreet) return null;
    const [locality] = named;
    const rest = locality.rest.trim();
    if (!rest) {
      resolved.push({
        place: { localityId: locality.id, streetId: null },
        scope,
      });
      context = { localityId: locality.id, streets: false };
      continue;
    }
    // "Lubaczów ul. Żuki", "Karolówka – ul. Sobieskiego", "Lisie Jamy: ul.
    // Polna", "Młodów ulice: Warszawska".
    const joined = new RegExp(
      `^(?:[–:-]\\s*)?(?:${STREET_MARK}\\s*)(.+)$|^[–:-]\\s*(.+)$`,
      "i",
    ).exec(rest);
    const id = joined && street(places, locality.id, joined[1] ?? joined[2]);
    if (!id) return null;
    resolved.push({ place: { localityId: locality.id, streetId: id }, scope });
    context = { localityId: locality.id, streets: true };
  }
  return resolved;
}

/**
 * Every locality the post may concern, by name: for a Notice. Namesakes all
 * count; a name inside a longer one ("Basznia" in "Basznia Dolna") does not.
 */
function mentioned(line: string, places: ZukPlaces): string[] {
  const hits = places.localities.flatMap((l) =>
    [
      ...line.matchAll(
        new RegExp(`(?<![\\p{L}])${namePattern(l.name)}(?![\\p{L}])`, "giu"),
      ),
    ].map((m) => ({ id: l.id, from: m.index, to: m.index + m[0].length })),
  );
  const ids = hits
    .filter(
      (h) =>
        !hits.some(
          (o) =>
            o.to - o.from > h.to - h.from && o.from <= h.from && o.to >= h.to,
        ),
    )
    .map((h) => h.id);
  return [...new Set(ids)].sort();
}

function noticeOf(post: ZukPost, places: ZukPlaces, checkedAt: string): Notice {
  const title = text(post.title.rendered);
  return {
    uid: `zuk-${post.id}`,
    kind: "water",
    title,
    localityIds: mentioned(text(`${title} ${post.content.rendered}`), places),
    publishedAt: wall(post.date),
    updatedAt: wall(post.modified),
    source: { name: SOURCE_NAME, url: post.link, checkedAt },
  };
}

function classify(
  post: ZukPost,
  places: ZukPlaces,
  checkedAt: string,
): Classified {
  const title = text(post.title.rendered);
  const paragraphs = blocks(post.content.rendered, "p");
  const items = blocks(post.content.rendered, "li");
  const body = [...paragraphs, ...items].join(" ");
  const source: DisruptionSource = {
    name: SOURCE_NAME,
    url: post.link,
    checkedAt,
  };
  const publishedAt = wall(post.date);
  const updatedAt = wall(post.modified);
  const doubt = (reason: Doubt): Classified => ({
    post,
    doubt: reason,
    notice: noticeOf(post, places, checkedAt),
  });

  if (CHANGE.test(`${title} ${body}`)) return doubt("change");
  if (!PLANNED.test(body)) return doubt("tense");

  const dated = datesIn(body);
  if (dated.length === 0 || dated.some((d) => d === null))
    return doubt("structure");
  const days = dated as Dated[];
  if (!days.every(weekdayMatches)) return doubt("weekday");
  const bodyDates = new Set(days.map((d) => d.iso));
  const fromTitle = titleDates(title);
  if (
    !fromTitle ||
    fromTitle.size !== bodyDates.size ||
    [...bodyDates].some((d) => !fromTitle.has(d))
  )
    return doubt("title-date");
  const posted = publishedAt.slice(0, 10);
  if ([...bodyDates].some((d) => d < posted || d > addDays(posted, 14)))
    return doubt("window");

  const read = readItems(paragraphs, items);
  if (typeof read === "string") return doubt(read);
  if (!read.every((i) => saneWindow(i.window))) return doubt("time");

  const revokedNote =
    [...paragraphs, ...items].find((p) => REVOKED.test(p)) ?? null;
  const modified = warsawToIso(updatedAt);
  const version = modified ? Math.floor(Date.parse(modified) / 1000) : 0;
  const disruptions: Disruption[] = [];
  const seen = new Set<string>();
  for (const item of read) {
    const resolved = resolvePlaces(item.where, places);
    if (!resolved || resolved.length === 0) return doubt("place");
    for (const date of item.dates) {
      for (const { place, scope } of resolved) {
        const uid = `zuk-${post.id}-${date}-${place.streetId ?? place.localityId}`;
        if (seen.has(uid)) return doubt("place");
        seen.add(uid);
        disruptions.push({
          uid,
          kind: "water",
          start: `${date} ${item.window.from}:00`,
          end: `${date} ${item.window.to}:00`,
          place,
          where: item.where,
          scope,
          status: revokedNote ? "revoked" : "planned",
          revokedNote,
          publishedAt,
          updatedAt,
          version,
          source,
        });
      }
    }
  }
  return { post, disruptions };
}

/** The dates a post's text names, read loosely (for cross-checks only). */
function looseDates(post: ZukPost): Set<string> {
  const all = text(`${post.title.rendered} ${post.content.rendered}`);
  return new Set(datesIn(all).flatMap((d) => (d ? [d.iso] : [])));
}

const isZukCut = (post: ZukPost) => {
  const all = text(`${post.title.rendered} ${post.content.rendered}`);
  return (
    /Zakład\s+Usług\s+Komunalnych/i.test(all) &&
    /Mokrzyc/i.test(all) &&
    /przerw\p{L}*\s+w\s+dostaw\p{L}*\s+wody/iu.test(all)
  );
};

const dayAndPlace = (d: Disruption) =>
  `${d.start.slice(0, 10)}|${d.place.streetId ?? d.place.localityId}`;

/**
 * ZUK's water cut notices from a WordPress REST API response body (a list of
 * posts; other posts are skipped). Across posts: a change notice ("zmiana
 * terminu", "aktualizacja") naming a date turns other posts' cuts that day
 * into Notices, and so do two posts giving the same place and day different
 * hours. Throws if the body is not a list of posts.
 */
export function parseZuk(
  body: string,
  places: ZukPlaces,
  checkedAt: string,
): ZukResult {
  const posts: unknown = JSON.parse(body);
  if (!Array.isArray(posts)) throw new Error("ZUK: not a list of posts");
  const classified = (posts as ZukPost[])
    .filter(isZukCut)
    .map((post) => classify(post, places, checkedAt));

  const changed = new Set(
    classified.flatMap((c) =>
      "doubt" in c && c.doubt === "change" ? [...looseDates(c.post)] : [],
    ),
  );
  const hours = new Map<string, Set<string>>();
  for (const c of classified) {
    if (!("disruptions" in c)) continue;
    for (const d of c.disruptions) {
      const key = dayAndPlace(d);
      hours.set(key, (hours.get(key) ?? new Set()).add(`${d.start}-${d.end}`));
    }
  }
  const disruptions: Disruption[] = [];
  const notices: Notice[] = [];
  for (const c of classified) {
    if ("notice" in c) {
      notices.push(c.notice);
      continue;
    }
    const clash = c.disruptions.some(
      (d) =>
        changed.has(d.start.slice(0, 10)) ||
        (hours.get(dayAndPlace(d))?.size ?? 0) > 1,
    );
    if (clash) notices.push(noticeOf(c.post, places, checkedAt));
    else disruptions.push(...c.disruptions);
  }
  return { disruptions, notices };
}

/** For the tests: one post's reading, with the reason when it is a Notice. */
export function classifyPost(
  post: ZukPost,
  places: ZukPlaces,
  checkedAt: string,
): { disruptions: Disruption[] } | { notice: Notice; doubt: Doubt } {
  const { post: _, ...rest } = classify(post, places, checkedAt);
  return rest;
}
