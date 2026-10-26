// The place gate (v3.1, task 114b; gate-spec.md of the X8 handoff, ported
// from its gate_v31.py): what the model read for one item, checked against
// the post's own text and mapped to our places (TERYT: the source is mapped
// to TERYT, never the other way). Pure, and generic: everything comes from
// the places data (the TERYT snapshot, lib/zuk-places.generated.ts), with
// no place-specific code, list or alias. An item is kept only if every
// check passes, in order; the first that fails is the reason:
// 1. the day is written in the post (D.M, "D <month>", inside "a-b.M",
//    "a do b.M", "a.M - b.M"), a weekday in brackets after it agreeing;
// 2. locality is one of ours ("Name (Village)" for a part; a bare name a
//    village and a part share is the village);
// 3. locality_verbatim is in the text, 4. exactly the locality's name (case
//    and diacritics aside), 5. at least once not inside a longer name of
//    ours ("Basznia" in "Basznia Dolna");
// 6. street_verbatim is in the text; 7. the street is exactly one of that
//    locality's, by a whole form (the name or its CECHA form, "os.
//    Wolności") or else a unique whole-word end ("Sobieskiego"); 8. what
//    street_verbatim writes points to this street only: no rival ends so,
//    or it is the full form with no rival's longer one written, or the type
//    word before it fits this street's CECHA alone ("ul. Mickiewicza");
// 9. the locality mention that decides for street_verbatim (one in a
//    bracket right after it, else the nearest before it, else the nearest
//    after it in its sentence) is this locality, or a part and its village,
//    written exactly: an inflected mention can block but never approve;
// 10. the town is never taken whole;
// 11. a note is one literal piece of the post naming no other place of ours.
// A mention is a capitalised run of words of one line matching one of our
// names, a word matching if they share a stem (the word less 0-3 final
// letters, at least 3 left); all-caps words only exactly ("ZUK" is not
// "Żuki"), and an inflected look-alike that is a street ("Piaskowa") is
// none.

import type { Locality } from "./data-model.ts";

/** Our places: the TERYT snapshot (lib/zuk-places.generated.ts). */
export type ZukPlaces = {
  localities: Array<{
    id: string;
    name: string;
    kind: Locality["kind"];
    parentId: string | null;
  }>;
  streets: Array<{
    id: string;
    localityId: string;
    /** NAZWA_2 NAZWA_1, "Jana III Sobieskiego". */
    name: string;
    /** TERYT CECHA, "ul.", "os.", "al.", "rondo", "skwer". */
    cecha: string;
    /** TERYT NAZWA_1, "Osiedle Wolności". */
    name1: string;
  }>;
};

type ZukLocality = ZukPlaces["localities"][number];
type ZukStreet = ZukPlaces["streets"][number];

/** What the gate reads of an item (lib/zuk-ai.ts AiItem). */
export type GateItem = {
  date: string;
  locality: string;
  locality_verbatim: string;
  street: string | null;
  street_verbatim: string | null;
  note: string | null;
};

export type GateResult =
  | {
      kept: true;
      locality: ZukLocality;
      street: ZukStreet | null;
    }
  /** `date`: the day failed (check 1); else the place. */
  | { kept: false; reason: string; date: boolean };

const MIN_STEM = 3;
const MAX_CUT = 3;

// ---------- text ----------

const deaccent = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L");
const dl = (s: string) => deaccent(s).toLowerCase();
/** Literal comparison: dashes one, spaces collapsed, lower case. */
const norm = (s: string) =>
  s
    .replace(/[–—]/g, "-")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
/** Word comparison: no diacritics, lower case, padded by spaces. */
const wnorm = (s: string) =>
  ` ${dl(s)
    .replace(/[^0-9a-z]+/g, " ")
    .trim()} `;
const WORD = /\p{L}+/gu;
const words = (s: string) => s.match(WORD) ?? [];
const isUpper = (s: string) => s === s.toUpperCase() && s !== s.toLowerCase();

/** The post's title and text as the gate reads them. */
export const gateText = (title: string, text: string) =>
  `${title}\n${text}`.replace(/[–—]/g, "-").replace(/ /g, " ");

// ---------- 1. the day ----------

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
 * The day is inside a range of two full dates (task 114b, post 23860:
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

// ---------- the inflection rule ----------

function stems(w: string): Set<string> {
  const d = dl(w);
  const out = new Set<string>();
  for (let i = 0; i <= MAX_CUT; i++)
    if (d.length - i >= MIN_STEM) out.add(d.slice(0, d.length - i));
  return out;
}

type Match = "exact" | "infl" | null;

function wordMatch(a: string, b: string): Match {
  const [x, y] = [dl(a), dl(b)];
  if (x === y) return "exact";
  const sx = stems(x);
  for (const s of stems(y)) if (sx.has(s)) return "infl";
  return null;
}

function nameMatch(verbatim: string, name: string): Match {
  const [v, n] = [words(verbatim), words(name)];
  if (v.length !== n.length || v.length === 0) return null;
  const ms = v.map((w, i) => wordMatch(w, n[i]));
  if (ms.includes(null)) return null;
  return ms.every((m) => m === "exact") ? "exact" : "infl";
}

function confusable(a: string, b: string): boolean {
  for (const sa of stems(a))
    for (const sb of stems(b)) {
      const [lo, hi] = sa.length <= sb.length ? [sa, sb] : [sb, sa];
      if (hi.startsWith(lo) && hi.length - lo.length <= MAX_CUT) return true;
    }
  return false;
}

// ---------- our places ----------

/**
 * A street's forms: its name, and its CECHA form when NAZWA_1's first word
 * begins with the CECHA's stem and is not the CECHA: "Osiedle Wolności"
 * (os.) is also "os. Wolności".
 */
export function streetForms(s: ZukStreet): string[] {
  const out = [s.name];
  const cecha = s.cecha ?? "";
  const name1 = s.name1 ?? "";
  const space = name1.indexOf(" ");
  const first = space < 0 ? name1 : name1.slice(0, space);
  const rest = space < 0 ? "" : name1.slice(space + 1);
  const stem = cecha.replace(/\.+$/, "").toLowerCase();
  if (
    rest &&
    stem &&
    first.toLowerCase().startsWith(stem) &&
    first.toLowerCase() !== cecha.toLowerCase()
  )
    out.push(`${cecha} ${rest}`);
  return out;
}

/** Our places, indexed for the gate. */
export class GatePlaces {
  readonly byId = new Map<string, ZukLocality>();
  readonly byName = new Map<string, ZukLocality[]>();
  /** Every locality name, in code-unit order. */
  readonly names: string[];
  readonly streets = new Map<string, ZukStreet[]>();
  /** Every street form, dl(), in any locality. */
  readonly streetNames = new Set<string>();

  constructor(places: ZukPlaces) {
    for (const l of places.localities) {
      this.byId.set(l.id, l);
      this.byName.set(l.name, [...(this.byName.get(l.name) ?? []), l]);
    }
    this.names = [...this.byName.keys()].sort();
    for (const s of places.streets) {
      this.streets.set(s.localityId, [
        ...(this.streets.get(s.localityId) ?? []),
        s,
      ]);
      for (const f of streetForms(s)) this.streetNames.add(dl(f));
    }
  }

  /** The same locality, or a village part and its village. */
  compatible(name: string, loc: ZukLocality): boolean {
    return (this.byName.get(name) ?? []).some(
      (l) => l.id === loc.id || l.parentId === loc.id || loc.parentId === l.id,
    );
  }

  /** "Name" or "Name (Village)" as one locality, and the name to match. */
  resolve(locality: string): [ZukLocality | null, string] {
    const name = locality.trim();
    const part = /^(.*?)\s*\((.+)\)$/.exec(name);
    if (part) {
      const c = (this.byName.get(part[1]) ?? []).filter(
        (l) => l.parentId && this.byId.get(l.parentId)?.name === part[2],
      );
      return [c.length === 1 ? c[0] : null, part[1]];
    }
    let c = this.byName.get(name) ?? [];
    if (c.length === 0)
      c = [...this.byId.values()].filter((l) => dl(l.name) === dl(name));
    if (c.length === 1) return [c[0], c[0].name];
    const settlements = c.filter((l) => l.kind !== "czesc_wsi");
    return [
      settlements.length === 1 ? settlements[0] : null,
      c.length > 0 ? c[0].name : name,
    ];
  }

  /**
   * Names of ours that match each other under the inflection rule (CI:
   * none), and pairs a third word could match both of (for review).
   */
  crossReport(): { direct: string[][]; confusable: string[][] } {
    const direct: string[][] = [];
    const pairs: string[][] = [];
    for (const [i, a] of this.names.entries())
      for (const b of this.names.slice(i + 1)) {
        const [wa, wb] = [words(a), words(b)];
        if (wa.length !== wb.length) continue;
        if (nameMatch(a, b)) direct.push([a, b]);
        if (wa.every((x, k) => confusable(x, wb[k]))) pairs.push([a, b]);
      }
    return { direct, confusable: pairs };
  }
}

// ---------- locality mentions ----------

export type Mention = {
  start: number;
  end: number;
  name: string;
  exact: boolean;
};

/** Every mention of one of our localities in `text`, nested ones dropped. */
export function mentions(text: string, places: GatePlaces): Mention[] {
  const toks = [...text.matchAll(WORD)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
    word: m[0],
  }));
  const out: Mention[] = [];
  for (const name of places.names) {
    const nw = words(name);
    const k = nw.length;
    for (let i = 0; i + k <= toks.length; i++) {
      const win = toks.slice(i, i + k);
      const [from, to] = [win[0].start, win[k - 1].end];
      if (text.slice(from, to).includes("\n")) continue;
      if (!isUpper(win[0].word[0])) continue;
      const ms = win.map((t, j) => wordMatch(t.word, nw[j]));
      if (ms.includes(null)) continue;
      if (ms.some((m, j) => m === "infl" && isUpper(win[j].word))) continue;
      const infl = ms.includes("infl");
      if (infl && places.streetNames.has(dl(text.slice(from, to)))) continue;
      out.push({ start: from, end: to, name, exact: !infl });
    }
  }
  return out.filter(
    (m) =>
      !out.some(
        (o) =>
          o !== m &&
          o.start <= m.start &&
          o.end >= m.end &&
          o.end - o.start > m.end - m.start,
      ),
  );
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Where `verbatim` occurs in `text`, any case, any run of spaces. */
function occurrences(text: string, verbatim: string): Array<[number, number]> {
  const toks = verbatim.split(/\s+/).filter(Boolean);
  if (toks.length === 0) return [];
  const re = new RegExp(toks.map(escapeRe).join("\\s+"), "giu");
  return [...text.matchAll(re)].map((m) => [m.index, m.index + m[0].length]);
}

/** The end of the sentence (or line) from `pos`; "ul." ends none. */
function sentenceEnd(text: string, pos: number): number {
  const nl = text.indexOf("\n", pos);
  const lineEnd = nl < 0 ? text.length : nl;
  const re = /([\p{L}\p{N}_]+)([.!?])\s+(?=[A-ZĄĆĘŁŃÓŚŹŻ])/gu;
  for (const m of text.slice(pos, lineEnd).matchAll(re))
    if (m[1].length > 3) return pos + m.index + m[1].length + 1;
  return lineEnd;
}

type Decided = { how: string; good: boolean; name: string | null };

/** 9: the deciding mention for each occurrence of street_verbatim. */
function proximity(
  text: string,
  found: Mention[],
  verbatim: string,
  loc: ZukLocality,
  places: GatePlaces,
): Decided {
  const res: Decided[] = [];
  for (const [s, e] of occurrences(text, verbatim)) {
    const br = /^\s*\(([^)]*)\)/.exec(text.slice(e));
    const open = br ? e + br[0].indexOf("(") + 1 : 0;
    const inBracket = br
      ? found.filter((m) => m.start >= open && m.end <= open + br[1].length)
      : [];
    const before = found.filter((m) => m.end <= s);
    let n: Mention;
    let how: string;
    if (inBracket.length > 0) [n, how] = [inBracket[0], "bracket"];
    else if (before.length > 0) {
      n = before.reduce((a, m) => (m.end > a.end ? m : a));
      how = "prev";
    } else {
      const end = sentenceEnd(text, e);
      const after = found.filter((m) => m.start >= e && m.end <= end);
      if (after.length === 0) {
        res.push({ how: "none", good: false, name: null });
        continue;
      }
      n = after.reduce((a, m) => (m.start < a.start ? m : a));
      how = "next";
    }
    res.push({
      how,
      good: places.compatible(n.name, loc) && n.exact,
      name: n.name,
    });
  }
  return (
    res.find((r) => r.good) ??
    res[0] ?? { how: "noocc", good: false, name: null }
  );
}

// ---------- the street ----------

/** 7: the locality's streets `street` means: a whole form first, else an end. */
function pickStreet(
  places: GatePlaces,
  loc: ZukLocality,
  street: string,
): ZukStreet[] {
  const sw = wnorm(street);
  const own = places.streets.get(loc.id) ?? [];
  const exact = own.filter((s) => streetForms(s).some((f) => wnorm(f) === sw));
  if (exact.length > 0) return exact;
  return own.filter((s) => streetForms(s).some((f) => wnorm(f).endsWith(sw)));
}

/** The word before `at` in `svw`, if any, begins with the street's CECHA stem. */
function typeFits(svw: string, at: number, s: ZukStreet): boolean {
  const before = svw.slice(0, at).trim().split(/\s+/).filter(Boolean);
  if (before.length === 0) return true;
  const stem = (s.cecha ?? "").replace(/\.+$/, "").toLowerCase();
  return stem !== "" && dl(before[before.length - 1]).startsWith(dl(stem));
}

/** 8: street_verbatim writes this street, and only it. */
function streetInVerbatim(
  places: GatePlaces,
  loc: ZukLocality,
  street: ZukStreet,
  verbatim: string,
): boolean {
  const svw = wnorm(verbatim);
  const own = places.streets.get(loc.id) ?? [];
  for (const f of streetForms(street)) {
    const fw = wnorm(f).trim().split(" ");
    for (let k = 0; k < fw.length; k++) {
      const end = ` ${fw.slice(k).join(" ")} `;
      if (!svw.includes(end)) continue;
      const others = own.filter(
        (s) =>
          s.id !== street.id &&
          streetForms(s).some((g) => wnorm(g).endsWith(end)),
      );
      if (others.length === 0) return true;
      if (
        k === 0 &&
        !others.some((s) => streetForms(s).some((g) => svw.includes(wnorm(g))))
      )
        return true;
      const at = svw.indexOf(end) + 1;
      if (
        typeFits(svw, at, street) &&
        !others.some((s) => typeFits(svw, at, s))
      )
        return true;
    }
  }
  return false;
}

// ---------- the gate ----------

/**
 * One item through every check, `text` from gateText and `found` its
 * mentions (computed once per post).
 */
export function gateItem(
  places: GatePlaces,
  text: string,
  found: Mention[],
  item: GateItem,
): GateResult {
  const drop = (reason: string, date = false): GateResult => ({
    kept: false,
    reason,
    date,
  });
  const txt = norm(text);
  const day = guardDate(item.date, txt);
  if (day) return drop(day, true);
  const [loc, name] = places.resolve(item.locality);
  if (!loc) return drop(`locality '${item.locality}' not ours/ambiguous`);
  const lv = item.locality_verbatim ?? "";
  if (!(lv.trim() && txt.includes(norm(lv))))
    return drop("locality_verbatim not literal");
  if (nameMatch(lv, name) !== "exact")
    return drop("locality_verbatim does not match locality");
  const own = occurrences(text, lv).some(
    ([s, e]) =>
      !found.some(
        (m) =>
          m.start <= s &&
          m.end >= e &&
          m.end - m.start > e - s &&
          m.name !== loc.name,
      ),
  );
  if (!own) return drop("locality_verbatim only inside a longer place name");
  let street: ZukStreet | null = null;
  const sv = item.street_verbatim;
  if (item.street) {
    if (!(sv && txt.includes(norm(sv))))
      return drop("street_verbatim not literal");
    const candidates = pickStreet(places, loc, item.street);
    if (candidates.length !== 1)
      return drop(
        `street '${item.street}' matches ${candidates.length} in ${loc.name}`,
      );
    street = candidates[0];
    if (!streetInVerbatim(places, loc, street, sv))
      return drop("street_verbatim lacks street name");
    const decided = proximity(text, found, sv, loc, places);
    if (!decided.good)
      return drop(
        `proximity: deciding mention ${decided.name ?? "None"} (${decided.how})`,
      );
  } else if (loc.kind === "miasto") return drop("town without street");
  if (item.note !== null) {
    if (!txt.includes(norm(item.note))) return drop("note not literal");
    if (
      mentions(item.note, places).some(
        (m) => m.exact && !places.compatible(m.name, loc),
      )
    )
      return drop("note names another place");
  }
  return { kept: true, locality: loc, street };
}
