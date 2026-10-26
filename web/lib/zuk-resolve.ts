// The place gate: what the model read for one item, checked only where
// the check is certain, and mapped to our places (TERYT: the source is
// mapped to TERYT, never the other way). Pure, and generic: everything
// comes from the places data (the TERYT snapshot and the districts), with
// no place-specific code, list or alias. Everything interpretive (which
// place a word means, a qualifier, a doubt) is the model's
// (lib/water-prompt.ts). An item is kept only if every check passes, in
// order; the first that fails is the reason (Reason):
// 1. the day is written in the post (D.M, "D <month>", inside "a-b.M",
//    "a do b.M", "a.M - b.M", "a-b <month>", "z a na b <month>", a range
//    of two full dates), a year and a weekday in brackets after it agreeing;
// 2. locality is a listed name of the source's list (Listed), exactly;
// 3. locality_verbatim is in the post; none only for the locality the
//    source's posts concern without naming it (`implied`);
// 4. street is a listed street or district of that locality, exactly, and
//    street_verbatim is in the post; street_verbatim with no street is a
//    street not on the list;
// 5. the town without a street only with whole_town, its words in the post;
// 6. the note is in the post.
// "In the post": a literal substring of the title and text, case, dashes
// and runs of spaces aside.

import type { Locality } from "./data-model.ts";
import type { District } from "./districts.ts";

/**
 * Our places: the TERYT snapshot (lib/zuk-places.generated.ts), and the
 * town's district names (lib/districts.ts) where given.
 */
export type ZukPlaces = {
  districts?: District[];
  localities: Array<{
    id: string;
    name: string;
    kind: Locality["kind"];
    parentId: string | null;
  }>;
  streets: Array<{
    id: string;
    localityId: string;
    /** NAZWA_2 NAZWA_1, "Jana Próbnego". */
    name: string;
    /** TERYT CECHA, "ul.", "os.", "al.", "rondo", "skwer". */
    cecha: string;
    /** TERYT NAZWA_1, "Osiedle Próbne". */
    name1: string;
  }>;
};

export type ZukLocality = ZukPlaces["localities"][number];
export type ZukStreet = ZukPlaces["streets"][number];

/** Why an item failed: a short fixed code (the rejected list, lib/zuk-data.ts). */
export type Reason =
  | "locality not listed"
  | "street not listed"
  | "district has no streets"
  | "not in post"
  | "date"
  | "time";

/** What the gate reads of an item (lib/zuk-ai.ts AiItem). */
export type GateItem = {
  date: string;
  locality: string | null;
  locality_verbatim: string | null;
  street: string | null;
  street_verbatim: string | null;
  note: string | null;
  whole_town: boolean;
  whole_town_verbatim: string | null;
};

export type GateResult =
  | {
      kept: true;
      locality: ZukLocality;
      /** A listed street, or a listed district; neither: the whole place. */
      street: ZukStreet | null;
      district: District | null;
    }
  /** `locality`: the listed locality, if it passed. */
  | { kept: false; reason: Reason; locality: ZukLocality | null };

/** Literal comparison: dashes one, spaces collapsed, lower case. */
const norm = (s: string) =>
  s
    .replace(/[–—]/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();

/** The post's title and text as the gate reads them. */
export const gateText = (title: string, text: string) =>
  `${title}\n${text}`.replace(/[–—]/g, "-").replace(/\u00a0/g, " ");

/** `words` are in the post (gateText), case, dashes and spaces aside. */
export const inPost = (words: string, text: string) =>
  words.trim() !== "" && norm(text).includes(norm(words));

// ---------- the day ----------

const WEEKDAYS = [
  "poniedziałek",
  "wtorek",
  "środa",
  "czwartek",
  "piątek",
  "sobota",
  "niedziela",
];
export const MONTHS = [
  "stycznia",
  "lutego",
  "marca",
  "kwietnia",
  "maja",
  "czerwca",
  "lipca",
  "sierpnia",
  "września",
  "października",
  "listopada",
  "grudnia",
];

/** Null if the day is written in the post (gateText), else why. */
const dayInText = (date: string, text: string) => guardDate(date, norm(text));

/** Null if the day is written in `txt` (norm of the post), else why. */
export function guardDate(date: string, txt: string): string | null {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(`${date}T12:00:00Z`)
    : null;
  if (
    !day ||
    Number.isNaN(day.getTime()) ||
    day.toISOString().slice(0, 10) !== date
  )
    return "bad date";
  const D = day.getUTCDate();
  const M = day.getUTCMonth() + 1;
  const weekday = (day.getUTCDay() + 6) % 7;
  const Y = date.slice(0, 4);
  // A year written with the day must be the item's year (task 114b).
  const ofYear = (m: RegExpMatchArray) => m[1] === undefined || m[1] === Y;
  const hits = [
    new RegExp(`(?<!\\d)0?${D}\\.0?${M}(?:\\.(\\d{4}))?(?!\\d)`, "g"),
    new RegExp(`(?<!\\d)0?${D}\\s+${MONTHS[M - 1]}(?:\\s+(\\d{4}))?`, "g"),
  ]
    .flatMap((p) => [...txt.matchAll(p)])
    .filter(ofYear);
  if (hits.length > 0) {
    for (const h of hits) {
      const named = /^[.\s]*\d{0,4}\s*r?\.?\s*\(([^)]*)\)/.exec(
        txt.slice(h.index + h[0].length),
      )?.[1];
      const n = named?.trim() ?? "";
      if (WEEKDAYS.includes(n) && WEEKDAYS.indexOf(n) !== weekday)
        return `weekday mismatch ${date}`;
    }
    return null;
  }
  const within = (re: RegExp) =>
    [...txt.matchAll(re)].some(
      ([, a, b, y]) =>
        Number(a) <= D && D <= Number(b) && (y === undefined || y === Y),
    );
  if (
    within(
      new RegExp(
        `(?<!\\d)(\\d{1,2})\\s*(?:-|do)\\s*(\\d{1,2})\\.0?${M}(?:\\.(\\d{4}))?(?!\\d)`,
        "g",
      ),
    ) ||
    within(
      new RegExp(
        `(?<!\\d)(\\d{1,2})\\.0?${M}\\.?\\s*(?:-|do|i)\\s*(\\d{1,2})\\.0?${M}(?:\\.(\\d{4}))?(?!\\d)`,
        "g",
      ),
    ) ||
    within(
      new RegExp(
        `(?<!\\d)(\\d{1,2})\\s*(?:-|do|na)\\s*(\\d{1,2})\\s+${MONTHS[M - 1]}(?:\\s+(\\d{4}))?`,
        "g",
      ),
    ) ||
    inFullRange(date, txt)
  )
    return null;
  return `${D}.${M} not in text`;
}

const FULL = String.raw`(\d{1,2})\.(\d{1,2})\.(\d{4})`;
/** "(od) D.M.YYYY do D.M.YYYY", "D.M.YYYY - D.M.YYYY" (dashes are "-"). */
const FULL_RANGE = new RegExp(
  `(?<!\\d)(?:od\\s+)?${FULL}\\s*(?:do|-)\\s*${FULL}(?!\\d)`,
  "g",
);

/**
 * The day is inside a range of two full dates (task 114b:
 * "od 06.11.2023 do 10.11.2023"), both ends included; a reversed range
 * holds no day.
 */
function inFullRange(date: string, txt: string): boolean {
  const iso = (d: string, m: string, y: string) =>
    `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  return [...txt.matchAll(FULL_RANGE)].some(([, d1, m1, y1, d2, m2, y2]) => {
    const [from, to] = [iso(d1, m1, y1), iso(d2, m2, y2)];
    return from <= date && date <= to;
  });
}

// ---------- the list ----------

/** "Name", or "Name (Village)" for a part: as the prompt lists it. */
export function listedName(
  l: ZukLocality,
  byId: Map<string, ZukLocality>,
): string {
  const parent = l.parentId ? byId.get(l.parentId) : undefined;
  return parent ? `${l.name} (${parent.name})` : l.name;
}

/**
 * The places a source's posts may name, by their listed names: every
 * locality of `area` (null: all of ours), its streets and districts.
 */
export class Listed {
  readonly byId = new Map<string, ZukLocality>();
  readonly localities = new Map<string, ZukLocality>();
  readonly streets = new Map<string, Map<string, ZukStreet>>();
  readonly districts = new Map<string, Map<string, District>>();
  readonly data: ZukPlaces;

  constructor(places: ZukPlaces, area: ReadonlySet<string> | null = null) {
    this.data = places;
    for (const l of places.localities) this.byId.set(l.id, l);
    for (const l of places.localities)
      if (!area || area.has(l.id))
        this.localities.set(listedName(l, this.byId), l);
    const add = <T>(
      into: Map<string, Map<string, T>>,
      localityId: string,
      name: string,
      value: T,
    ) => {
      const own = into.get(localityId) ?? new Map<string, T>();
      own.set(name, value);
      into.set(localityId, own);
    };
    for (const s of places.streets) add(this.streets, s.localityId, s.name, s);
    for (const d of places.districts ?? [])
      add(this.districts, d.localityId, d.name, d);
  }

  /**
   * The localities a listed name is, or lies in (a street or district of
   * that name, in any of them); none if it is not listed.
   */
  localitiesOf(name: string): string[] {
    const own = this.localities.get(name);
    if (own) return [own.id];
    return [...this.localities.values()]
      .filter(
        (l) =>
          this.streets.get(l.id)?.has(name) ||
          this.districts.get(l.id)?.has(name),
      )
      .map((l) => l.id);
  }

  /** Every listed name: a locality, street or district. */
  has(name: string): boolean {
    return this.localitiesOf(name).length > 0;
  }
}

// ---------- the gate ----------

/**
 * One item through every check, `text` from gateText; `implied` the
 * locality the source's posts concern without naming it.
 */
export function gateItem(
  listed: Listed,
  text: string,
  item: GateItem,
  implied: string | null = null,
): GateResult {
  let locality: ZukLocality | null = null;
  const drop = (reason: Reason): GateResult => ({
    kept: false,
    reason,
    locality,
  });
  locality = (item.locality && listed.localities.get(item.locality)) || null;
  if (dayInText(item.date, text)) return drop("date");
  if (!locality) return drop("locality not listed");
  const lv = item.locality_verbatim;
  if (lv === null ? locality.id !== implied : !inPost(lv, text))
    return drop("not in post");
  const sv = item.street_verbatim;
  let street: ZukStreet | null = null;
  let district: District | null = null;
  if (item.street !== null) {
    street = listed.streets.get(locality.id)?.get(item.street) ?? null;
    district = street
      ? null
      : (listed.districts.get(locality.id)?.get(item.street) ?? null);
    if (!street && !district) return drop("street not listed");
    if (sv === null || !inPost(sv, text)) return drop("not in post");
  } else if (sv !== null || (locality.kind === "miasto" && !item.whole_town))
    return drop("street not listed");
  if (
    item.whole_town &&
    !(item.whole_town_verbatim && inPost(item.whole_town_verbatim, text))
  )
    return drop("not in post");
  if (item.note !== null && !inPost(item.note, text))
    return drop("not in post");
  return { kept: true, locality, street, district };
}
