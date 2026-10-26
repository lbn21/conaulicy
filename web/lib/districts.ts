// The informal district names of a town (the gazetteer): estates and
// areas that TERYT has no name (or, for its town parts, no streets) for,
// but sources and residents use. Each is stored in the database
// (lib/db/schema.ts district_aliases, filled by scripts/districts-seed.ts
// from lib/districts-seed.ts) with the forms it is written in and its
// streets, each street whole or a stretch of it. The prompt gives the
// model the list (lib/water-prompt.ts); the model names a district by its
// listed name, and the water gate (lib/zuk.ts) expands it to its streets.
// Pure: no database here; no matching of words either, that is the model's.

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
  /** "Osiedle Przykładowe". */
  name: string;
  /** Every form it is written in, inflected ones too. */
  variants: string[];
  confidence: Confidence;
  sourceUrl: string;
  /** None: a name we cannot place, linked as written. */
  streets: DistrictStreet[];
};

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
