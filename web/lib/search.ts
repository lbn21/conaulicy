// Address search, the same everywhere: the search field (on the device, over
// the index from /api/search-index), /api/search and /szukaj (on the server,
// over the same index), so one query gives the same ranked places in all
// three. uFuzzy (@leeoniya/ufuzzy) forgives a typo; around it, a Polish layer
// reads the query (house number, postcode, "ul.", abbreviations, word
// endings) and ranks the places.

import uFuzzy from "@leeoniya/ufuzzy";
import { houseNumber, withHouseNumber } from "./house.ts";
import { normalize } from "./normalize.ts";
import { CECHA_WORDS } from "./places.ts";

export type SearchHit = {
  id: string;
  label: string;
  /** House number read from the query ("Asnyka 12"), for ?nr=. */
  nr?: string | null;
};

/**
 * What /api/search-index serves, per searchable place: [id, label, type].
 * The type is TERYT's: a street's CECHA ("ul.", "os.", "al.", lib/places.ts
 * CECHA_WORDS), or a locality's kind ("wies", "czesc_wsi", "miasto").
 */
export type SearchIndex = Array<[id: string, label: string, type: string]>;

/** Id of the home page's search element. */
export const SEARCH_ID = "szukaj";

/** At most this many places in the list. */
export const SEARCH_LIMIT = 8;

const STREET = "ul.";

// "ul. Asnyka" and "ulica Asnyka" find the same street; the word only hints
// that a street is meant (rather than an osiedle or a village).
const STREET_WORDS = new Set([
  normalize(STREET),
  normalize(CECHA_WORDS[STREET]),
]);

// One spelling per word, for labels and queries alike: each CECHA's
// abbreviation stands for its word ("os." = "osiedle", "pl." = "plac").
const SYNONYMS: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(CECHA_WORDS)
      .map(([cecha, word]) => [normalize(cecha), normalize(word)])
      .filter(([abbreviation, word]) => abbreviation !== word),
  ),
  trzeciego: "3",
  swietej: "sw",
  swietego: "sw",
  gen: "generala",
};

function canonical(text: string): string[] {
  return normalize(text)
    .replace(/\b3 go\b/g, "3")
    .replace(/\bchopin/g, "szopen")
    .split(" ")
    .filter((word) => word && !STREET_WORDS.has(word))
    .map((word) => SYNONYMS[word] ?? word);
}

/** The words to match; none when q is empty or only "ul." / "ulica". */
export function searchTerms(q: string): string[] {
  return canonical(q.replace(POSTCODE, " "));
}

const POSTCODE = /\b\d\d-\d\d\d\b/g;

// How well a query word matches a place, best first. A place's rank is its
// worst word, then the sum of all.
const EXACT = 0;
const PREFIX = 1;
const INFIX = 2;
const INFLECTED = 3;
const TYPO = 4;
const TWO_TYPOS = 5;

// One substitution, transposition, insertion or deletion inside a word.
const fuzzy = new uFuzzy({
  intraMode: 1,
  intraIns: 1,
  intraSub: 1,
  intraTrn: 1,
  intraDel: 1,
});

type Place = {
  hit: SearchHit;
  text: string;
  words: string[];
  type: string;
  /** Its type's word as search spells it ("osiedle"); "" for a locality. */
  typeWord: string;
  /** A part of a village: "Kamienna (Opaka, gm. Lubaczów)". */
  part: boolean;
  /** How many places its town or village has (see identity). */
  size: number;
};

/** "rynku" → "rynk": a Polish ending off, for words of 4+ letters. */
const stem = (term: string) =>
  term.length >= 4 && /[aeiuy]$/.test(term) ? term.slice(0, -1) : null;

// Optimal string alignment distance, capped: whether a and b are at most
// `max` edits apart.
function near(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        row[j] = Math.min(row[j], prev2[j - 2] + 1);
      }
    }
    if (Math.min(...row) > max) return false;
    prev2 = prev;
    prev = row;
  }
  return prev[b.length] <= max;
}

/**
 * Matching tier of each query word, per place: exact word, word prefix,
 * inside a word (3+ letters), with its ending off, then the fallbacks: one
 * typo (uFuzzy, 4+ letters), two typos (7+ letters). A single letter only
 * starts a word; a number is only a whole word ("3" in "3-go Maja").
 */
function tiers(places: Place[], terms: string[], pass: number): number[][] {
  const haystack = places.map((place) => place.text);
  return terms.map((term) => {
    const word = /^\d+$/.test(term) ? null : term;
    const root = word && stem(word);
    const typos =
      pass >= 1 && word && word.length >= 4
        ? new Set([
            ...(fuzzy.filter(haystack, word) ?? []),
            ...((root && fuzzy.filter(haystack, root)) ?? []),
          ])
        : null;
    return places.map(({ text, words }, i) => {
      if (words.includes(term)) return EXACT;
      if (!word) return -1;
      if (words.some((w) => w.startsWith(word))) return PREFIX;
      if (word.length === 1) return -1;
      if (word.length >= 3 && text.includes(word)) return INFIX;
      if (root && words.some((w) => w.startsWith(root))) return INFLECTED;
      if (typos?.has(i)) return TYPO;
      if (
        pass >= 2 &&
        word.length >= 7 &&
        words.some((w) => near(word, w.slice(0, word.length + 2), 2))
      ) {
        return TWO_TYPOS;
      }
      return -1;
    });
  });
}

type Ranked = { place: Place; key: number[]; bare: boolean; first: boolean };

/** Lower is better: worst word, sum of words, not a street for "ul.". */
function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

function rank(places: Place[], terms: string[], street: boolean): Ranked[] {
  const query = terms.join(" ");
  // The fallbacks run only when the stricter passes find nothing.
  for (const pass of [0, 1, 2]) {
    const found = tiers(places, terms, pass);
    const ranked: Ranked[] = [];
    places.forEach((place, i) => {
      const own = found.map((term) => term[i]);
      if (own.some((tier) => tier < 0)) return;
      ranked.push({
        place,
        key: [
          Math.max(...own),
          own.reduce((sum, tier) => sum + tier, 0),
          street && place.type !== STREET ? 1 : 0,
        ],
        // A bare name means a street (Polish addressing): another street
        // type whose word was not typed ("osiedle") yields to it. Villages
        // are not street types.
        bare:
          place.typeWord !== "" &&
          place.type !== STREET &&
          !terms.includes(place.typeWord),
        first: place.text.startsWith(query),
      });
    });
    if (ranked.length > 0) {
      return ranked.sort(
        (a, b) =>
          compareKeys(a.key, b.key) ||
          Number(a.place.part) - Number(b.place.part) ||
          Number(a.bare) - Number(b.bare) ||
          Number(b.first) - Number(a.first) ||
          b.place.size - a.place.size ||
          a.place.hit.label.length - b.place.hit.label.length ||
          byLabel(a.place.hit, b.place.hit),
      );
    }
  }
  return [];
}

type Reading = { text: string; nr: string | null };

/**
 * Ways to read a query: as typed (street names with digits: "3 Maja"), or
 * with one of its house numbers taken out, wherever it stands ("Asnyka 12",
 * "12 Asnyka", "ul. Rynek 5, Lubaczów"). Postcodes are dropped.
 */
function readings(q: string): Reading[] {
  const words = q
    .replace(POSTCODE, " ")
    .split(/[\s,;]+/)
    .filter(Boolean);
  const result: Reading[] = [{ text: words.join(" "), nr: null }];
  for (let i = words.length - 1; i >= 0; i--) {
    const nr = houseNumber(words[i]);
    if (nr && words.length > 1) {
      const text = words.filter((_, j) => j !== i).join(" ");
      result.push({ text, nr });
    }
  }
  return result;
}

const PART = "czesc_wsi";

/**
 * The town or village a place belongs to, by name as its label gives it
 * (lib/places.ts streetLabel, villageLabel): a street's locality, a
 * village itself, a part's parent village.
 */
function identity(label: string, type: string): string {
  if (type === PART)
    return label.slice(label.indexOf("(") + 1, label.indexOf(","));
  if (!CECHA_WORDS[type]) {
    return label.includes("(") ? label.slice(0, label.indexOf(" (")) : label;
  }
  return label.slice(label.lastIndexOf(",") + 2);
}

export type Found = {
  hits: SearchHit[];
  /** The first place is clearly the best (or the only) match. */
  clear: boolean;
};

export type Matcher = (q: string, limit?: number) => Found;

/**
 * Prepares every label once; the matcher then runs on each keystroke. It
 * reads q every way (readings) and keeps the reading whose best place
 * matches best; on a tie, the earliest (as typed, then the last number). At
 * most `limit` places: the search field lists 8, /szukaj every one.
 */
export function matcher(index: SearchIndex): Matcher {
  const sizes = new Map<string, number>();
  for (const [, label, type] of index) {
    const town = identity(label, type);
    sizes.set(town, (sizes.get(town) ?? 0) + 1);
  }
  const places: Place[] = index.map(([id, label, type]) => {
    const words = canonical(label);
    const word = CECHA_WORDS[type];
    return {
      hit: { id, label },
      text: words.join(" "),
      words,
      type,
      typeWord: word ? normalize(word) : "",
      part: type === PART,
      size: sizes.get(identity(label, type)) ?? 0,
    };
  });
  return (q, limit = SEARCH_LIMIT) => {
    let best: { ranked: Ranked[]; nr: string | null } | null = null;
    for (const { text, nr } of readings(q)) {
      const terms = searchTerms(text);
      if (terms.length === 0) continue;
      const street = normalize(text)
        .split(" ")
        .some((word) => STREET_WORDS.has(word));
      const ranked = rank(places, terms, street);
      if (
        ranked.length > 0 &&
        (!best || compareKeys(ranked[0].key, best.ranked[0].key) < 0)
      ) {
        best = { ranked, nr };
      }
    }
    if (!best) return { hits: [], clear: false };
    const { ranked, nr } = best;
    return {
      hits: ranked
        .slice(0, limit)
        .map(({ place }) => (nr ? { ...place.hit, nr } : place.hit)),
      clear:
        ranked.length === 1 || compareKeys(ranked[0].key, ranked[1].key) < 0,
    };
  };
}

export function byLabel(a: SearchHit, b: SearchHit): number {
  return a.label.localeCompare(b.label, "pl");
}

/**
 * The place whose suggestion text q is (the field holds it after a pick):
 * its label, or its label with a house number, where the field puts one
 * ("ul. Adama Asnyka 12, Lubaczów") or typed after it ("ul. Adama Asnyka,
 * Lubaczów 12"), compared as search compares (case, Polish letters,
 * punctuation, spaces). Null when no label, or more than one, reads so:
 * then the search proper decides.
 */
export function exactPlace(index: SearchIndex, q: string): SearchHit | null {
  const wanted = normalize(q);
  const numbers = new Set(
    // Words as the label separates them: "Asnyka 12, Lubaczów".
    q.split(/[\s,()]+/).flatMap((word) => houseNumber(word) ?? []),
  );
  for (const nr of [null, ...numbers]) {
    const found = index.filter(
      ([, label]) =>
        normalize(withHouseNumber(label, nr)) === wanted ||
        (nr !== null && normalize(`${label} ${nr}`) === wanted),
    );
    if (found.length === 1) {
      const [[id, label]] = found;
      return nr ? { id, label, nr } : { id, label };
    }
    if (found.length > 1) return null;
  }
  return null;
}

/** Where a hit links to: the place, and its house number if given. */
export function placeHref(hit: SearchHit): string {
  const path = `/adres/${encodeURIComponent(hit.id)}`;
  // A valid number is only digits, a-z and "/", all fine in a query.
  return hit.nr ? `${path}?nr=${hit.nr}` : path;
}

/** "1 adres", "3 adresy", "5 adresów", "22 adresy". */
export function addresses(n: number): string {
  if (n === 1) return "1 adres";
  const tens = n % 100;
  const ones = n % 10;
  if (ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)) return `${n} adresy`;
  return `${n} adresów`;
}
