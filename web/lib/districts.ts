// The informal district names of a town (the gazetteer): an "osiedle"
// named by residents. TERYT has no such names, but MZGKiM and residents use
// them. Stored in the database (lib/db/schema.ts district_aliases, filled by
// scripts/districts-seed.ts from lib/districts-seed.ts). Here only the types
// and the check of every street id against the TERYT snapshot. Pure: no
// database here.

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
