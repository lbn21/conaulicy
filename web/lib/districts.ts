// The informal district names of a town (the gazetteer): "osiedle Mazury",
// "os. Jagiellonów", "osiedle na zapleczu ul. Niemirowskiej". TERYT has no
// such names (or, for its town parts, no streets), but MZGKiM and residents
// use them. Each is stored in the database (lib/db/schema.ts
// district_aliases, filled by scripts/districts-seed.ts from
// lib/districts-seed.ts) with the forms it is written in and its streets,
// each street whole or a stretch of it. The water gate (lib/zuk.ts) expands
// a district to its streets, and the prompts give the model the list
// (lib/sources/*/prompt.ts). Pure: no database here.
//
// Matching is by words, case and diacritics aside: a form's first word
// "osiedle" also matches any of its inflections or "os." ("osiedlu",
// "osiedlem", "oś."), so "na osiedlu Mazury" is "Osiedle Mazury"; "X wraz
// z osiedlem" is the district named X too. A name inside a longer one of
// another district ("os. Mazury" in "os. Mazury VI") is not that name.

export type Confidence = "high" | "medium";

export type DistrictStreet = {
  /** Our street id, SIMC-SYM_UL: "0972447-38139". */
  id: string;
  confidence: Confidence;
  /** Only this stretch of the street ("bloki 24–34A"); null: all of it. */
  part: string | null;
  /** Where it is said to belong; null: the district's source. */
  sourceUrl: string | null;
};

export type District = {
  /** "mazury". */
  id: string;
  /** The town it lies in (SIMC): "0972447". */
  localityId: string;
  /** The TERYT town part of that name, if there is one: "0972453". */
  simc: string | null;
  /** "Osiedle Mazury". */
  name: string;
  /** Every form it is written in, inflected ones too. */
  variants: string[];
  confidence: Confidence;
  sourceUrl: string;
  /** None: a name we cannot place, linked as written. */
  streets: DistrictStreet[];
};

// ---------- words ----------

/** Lower case, no diacritics ("ł" too). */
const dl = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .toLowerCase();

type Token = { key: string; start: number; end: number };

const tokens = (text: string): Token[] =>
  [...text.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => ({
    key: dl(m[0]),
    start: m.index,
    end: m.index + m[0].length,
  }));

/** "osiedle", "osiedlu", "osiedlem", "os", "oś": the word for an estate. */
const isEstateWord = (key: string) => /^(?:osiedl\p{L}*|os)$/u.test(key);

const ESTATE = "*";

/** A form's words as matched: an estate word first is any estate word. */
const pattern = (form: string): string[] =>
  tokens(form).map((t, i) => (i === 0 && isEstateWord(t.key) ? ESTATE : t.key));

/** The words after the estate word of a form, if it has one. */
function nameWords(form: string): string[] | null {
  const p = pattern(form);
  return p[0] === ESTATE ? p.slice(1) : null;
}

const same = (a: string[], b: string[]) =>
  a.length === b.length && a.every((w, i) => w === b[i]);

/** Every pattern of a district: its forms, "X wraz z osiedlem" for its X. */
function patterns(d: District): string[][] {
  const out = [d.name, ...d.variants].map(pattern);
  const names = [d.name, ...d.variants].flatMap((f) => {
    const n = nameWords(f);
    return n && n.length > 0 ? [n] : [];
  });
  for (const n of names) out.push([...n, "wraz", "z", ESTATE]);
  return out.filter(
    (p, i) => p.length > 0 && out.findIndex((q) => same(p, q)) === i,
  );
}

const CLOSE: Record<string, string> = { "„": "”", "(": ")", '"': '"' };

// ---------- the text ----------

export type DistrictSpan = {
  district: District;
  /** The words as the post writes them: "na osiedlu Mazury" → "osiedlu Mazury". */
  words: string;
  /** Matched keys, the estate word as "*". */
  keys: string[];
  start: number;
  end: number;
};

/**
 * Every place the text names a district, a span inside a longer one (of
 * any district) dropped.
 */
export function districtSpans(
  text: string,
  districts: District[],
): DistrictSpan[] {
  const toks = tokens(text);
  const found: DistrictSpan[] = [];
  for (const d of districts)
    for (const p of patterns(d))
      for (let i = 0; i + p.length <= toks.length; i++) {
        const win = toks.slice(i, i + p.length);
        const ok = win.every((t, k) =>
          p[k] === ESTATE ? isEstateWord(t.key) : t.key === p[k],
        );
        if (!ok) continue;
        const start = win[0].start;
        let end = win[win.length - 1].end;
        const inside = text.slice(start, end);
        for (const [open, close] of Object.entries(CLOSE))
          if (
            inside.includes(open) &&
            !inside.slice(inside.lastIndexOf(open)).includes(close) &&
            text.slice(end).startsWith(close)
          )
            end += close.length;
        found.push({
          district: d,
          words: text.slice(start, end).replace(/\s+/g, " "),
          keys: p,
          start,
          end,
        });
      }
  return found.filter(
    (s) =>
      !found.some(
        (o) =>
          o !== s &&
          o.start <= s.start &&
          o.end >= s.end &&
          o.end - o.start > s.end - s.start,
      ),
  );
}

/** `words` are exactly the span's words: "os. Mazury" for "osiedle Mazury". */
function spells(span: DistrictSpan, words: string): boolean {
  const keys = tokens(words).map((t) => t.key);
  return (
    keys.length === span.keys.length &&
    keys.every((k, i) =>
      span.keys[i] === ESTATE ? isEstateWord(k) : k === span.keys[i],
    )
  );
}

/** The district `name` writes (its name or a form), case aside. */
export function districtNamed(
  name: string,
  districts: District[],
): District | null {
  const p = pattern(name);
  return (
    districts.find((d) =>
      [d.name, ...d.variants].some((f) => same(pattern(f), p)),
    ) ?? null
  );
}

/** The street of the town spelled as the district's bare name ("Mazury"). */
function namesake<S extends { id: string; localityId: string; name: string }>(
  d: District,
  streets: S[],
): S | null {
  const names = [d.name, ...d.variants]
    .map(nameWords)
    .filter((n): n is string[] => n !== null && n.length > 0);
  return (
    streets.find(
      (s) =>
        s.localityId === d.localityId &&
        names.some((n) => same(n, pattern(s.name))),
    ) ?? null
  );
}

/** The namesake street is the district's only street: no doubt. */
const onlyStreet = (d: District, streetId: string) =>
  d.streets.length === 1 && d.streets[0].id === streetId;

export type DistrictReading =
  /** The district, by the post's words for it. */
  | { kind: "district"; district: District; words: string }
  /**
   * A bare name ("Mazury") the model took for the district: the street of
   * that name, `uncertain` when the district has other streets.
   */
  | {
      kind: "street";
      district: District;
      streetId: string;
      words: string;
      uncertain: boolean;
    };

/**
 * What an item's place means in the gazetteer: the district its words
 * spell (`spans` of the post), or the one its street or locality names
 * (`claimed`) when the post writes it so; null if neither.
 */
export function readDistrict<
  S extends { id: string; localityId: string; name: string },
>(
  words: string,
  claimed: District | null,
  spans: DistrictSpan[],
  streets: S[],
): DistrictReading | null {
  const spelled = spans.find((s) => spells(s, words));
  if (spelled)
    return {
      kind: "district",
      district: spelled.district,
      words: spelled.words,
    };
  if (!claimed) return null;
  const keys = tokens(words).map((t) => t.key);
  // The model wrote only the name; the post writes "osiedle X".
  const named = spans.find(
    (s) =>
      s.district === claimed &&
      s.keys[0] === ESTATE &&
      same(s.keys.slice(1), keys),
  );
  if (named) return { kind: "district", district: claimed, words: named.words };
  const street = namesake(claimed, streets);
  if (street && same(pattern(street.name), keys))
    return {
      kind: "street",
      district: claimed,
      streetId: street.id,
      words,
      uncertain: !onlyStreet(claimed, street.id),
    };
  return { kind: "district", district: claimed, words };
}

/**
 * A street written bare where a district of its name has other streets
 * ("Mazury"): the text may mean either. Not when the post writes a street
 * word before it ("ul. Mazury") or "wraz z osiedlem" after it (the street
 * and the estate, both named).
 */
export function bareNamesake<
  S extends { id: string; localityId: string; name: string },
>(
  text: string,
  verbatim: string,
  streetId: string,
  districts: District[],
  streets: S[],
): boolean {
  const d = districts.find((x) => namesake(x, streets)?.id === streetId);
  if (!d || onlyStreet(d, streetId)) return false;
  const keys = tokens(verbatim).map((t) => t.key);
  if (keys.length === 0) return false;
  const toks = tokens(text);
  const at = (p: string[], i: number) =>
    i >= 0 &&
    i + p.length <= toks.length &&
    p.every((k, j) => toks[i + j].key === k);
  // Longer names of the town around it: "Boczna Mazury" is not "Mazury".
  const longer = streets
    .filter((s) => s.localityId === d.localityId && s.id !== streetId)
    .map((s) => pattern(s.name))
    .filter((p) => p.length > keys.length);
  let bare = false;
  for (let i = 0; i + keys.length <= toks.length; i++) {
    if (!at(keys, i)) continue;
    const inLonger = longer.some((p) => {
      for (let j = i + keys.length - p.length; j <= i; j++)
        if (at(p, j)) return true;
      return false;
    });
    if (inLonger) continue;
    const before = toks[i - 1]?.key ?? "";
    const after = toks.slice(i + keys.length, i + keys.length + 3);
    const withEstate =
      after.length === 3 &&
      after[0].key === "wraz" &&
      after[1].key === "z" &&
      isEstateWord(after[2].key);
    if (/^(?:ul|ulica|ulicy|ulice|ulic)$/.test(before) || withEstate) continue;
    if (isEstateWord(before)) continue;
    bare = true;
  }
  return bare;
}

/**
 * The district streets that are not ours (the TERYT snapshot) or not of
 * the district's town: what the gate skips (lib/zuk.ts districtPlaces).
 */
export function unknownStreets(
  districts: District[],
  streets: Array<{ id: string; localityId: string }>,
): Array<{ district: string; street: string }> {
  const ours = new Map(streets.map((s) => [s.id, s.localityId]));
  return districts.flatMap((d) =>
    d.streets
      .filter((s) => ours.get(s.id) !== d.localityId)
      .map((s) => ({ district: d.id, street: s.id })),
  );
}

/**
 * Every street id of every district is one of ours (the TERYT snapshot),
 * of the district's town; throws naming each that is not.
 */
export function checkDistricts(
  districts: District[],
  streets: Array<{ id: string; localityId: string }>,
): void {
  const bad = unknownStreets(districts, streets).map(
    (u) => `${u.district}: ${u.street}`,
  );
  const ids = districts.map((d) => d.id);
  const twice = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (bad.length > 0 || twice.length > 0)
    throw new Error(
      [
        ...bad.map((b) => `not a street of its town: ${b}`),
        ...twice.map((id) => `district twice: ${id}`),
      ].join("\n"),
    );
}

/**
 * The gazetteer for a prompt's context: one line per district of the
 * town, its name, forms and streets (TERYT names; a stretch in brackets).
 * Empty with no district.
 */
export function districtLines(
  districts: District[],
  streets: Array<{ id: string; name: string }>,
): string[] {
  const names = new Map(streets.map((s) => [s.id, s.name]));
  const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return [...districts]
    .sort((a, b) => byCode(a.name, b.name))
    .map((d) => {
      const forms =
        d.variants.length > 0 ? `; forms: ${d.variants.join(", ")}` : "";
      const own = d.streets
        .map((s) => {
          const name = names.get(s.id) ?? s.id;
          return s.part ? `${name} (${s.part})` : name;
        })
        .sort(byCode);
      const list = own.length > 0 ? `streets: ${own.join(", ")}` : "no streets";
      return `- ${d.name}${forms}; ${list}`;
    });
}
