// A place as a ZUK post names it, mapped to our places (TERYT: the source is
// mapped to TERYT, never the other way). Pure, over all our places in
// process, never search (its top results can hide a namesake). The model
// picks the name from our list (lib/zuk-ai.ts systemPrompt); these generic
// rules decide, and any name we cannot pin to exactly one place is dropped,
// never a fuzzy match or a hand-kept alias:
// - the name is one of our localities, written in the post's text and in the
//   item's phrase, at least once not inside a longer one of our names
//   ("Basznia" in "Basznia Dolna") and not as a street ("ul. Żuki");
// - a name two places share is the village, unless the phrase names the
//   village a part of that name belongs to; "przysiółek X" without that
//   village is dropped;
// - a street only among its locality's streets, the whole name or a unique
//   end of it ("Sobieskiego" for "Jana III Sobieskiego");
// - a locality-wide cut is the locality and every street of its own.
// House ranges never take part in matching; they travel as the scope.

import type { Locality } from "./data-model.ts";
import type {
  DisruptionLabel,
  DisruptionPlace,
  DisruptionScope,
} from "./disruptions.ts";
import { normalize } from "./normalize.ts";

/** Our places, as the database holds them (lib/schedule.ts zukPlaces). */
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
  }>;
};

type ZukLocality = ZukPlaces["localities"][number];

export type Wanted = {
  /** The model's locality, a name from our list. */
  locality: string;
  street: string | null;
  /** "(przysiółek Dąbrowa)": a village part of the locality. */
  hamlet: string | null;
  scope: DisruptionScope;
  /** The item's place phrase (place_verbatim), checked to be in the text. */
  phrase: string;
};

type ResolvedPlace = DisruptionPlace & { label: DisruptionLabel };

export type Resolved = { places: ResolvedPlace[]; scope: DisruptionScope };

/** Words before a name that make it a street's: "ul. Żuki". */
const STREET_WORDS = new Set(["ul", "ulica", "ulicy", "ulice", "al", "os"]);

/** Where `name` (normalized) starts as whole words in `text` (normalized). */
function wordsAt(text: string, name: string): number[] {
  const at: number[] = [];
  const padded = ` ${text} `;
  for (
    let i = padded.indexOf(` ${name} `);
    i >= 0;
    i = padded.indexOf(` ${name} `, i + 1)
  )
    at.push(i);
  return at;
}

/**
 * The name occurs in `text` at least once on its own: not inside a longer
 * name of ours, and not right after "ul.".
 */
function namedOnItsOwn(text: string, name: string, longer: string[]): boolean {
  const t = normalize(text);
  const covers = longer.flatMap((l) =>
    wordsAt(t, l).map((from) => ({ from, to: from + l.length })),
  );
  return wordsAt(t, name).some((from) => {
    const to = from + name.length;
    if (covers.some((c) => c.from <= from && c.to >= to)) return false;
    const before =
      t
        .slice(0, Math.max(0, from - 1))
        .split(" ")
        .pop() ?? "";
    return !STREET_WORDS.has(before);
  });
}

const names = (text: string, name: string) =>
  wordsAt(normalize(text), normalize(name)).length > 0;

/** The one locality the name means, or why not. */
function pickLocality(
  wanted: Wanted,
  text: string,
  places: ZukPlaces,
): ZukLocality | string {
  const name = normalize(wanted.locality);
  const candidates = places.localities.filter(
    (l) => normalize(l.name) === name,
  );
  if (!name || candidates.length === 0)
    return `no locality "${wanted.locality}"`;
  const longer = [
    ...new Set(places.localities.map((l) => normalize(l.name))),
  ].filter((l) => l.length > name.length && wordsAt(l, name).length > 0);
  if (!namedOnItsOwn(text, name, longer))
    return `"${wanted.locality}" not named on its own in the text`;
  if (!namedOnItsOwn(wanted.phrase, name, longer))
    return `"${wanted.locality}" not named on its own in "${wanted.phrase}"`;

  const parentOf = (l: ZukLocality) =>
    places.localities.find((p) => p.id === l.parentId);
  const withParent = candidates.filter((l) => {
    const parent = parentOf(l);
    return (
      l.kind === "czesc_wsi" && parent && names(wanted.phrase, parent.name)
    );
  });
  const settlements = candidates.filter((l) => l.kind !== "czesc_wsi");
  let locality: ZukLocality | undefined;
  if (candidates.length === 1) locality = candidates[0];
  else if (withParent.length === 1) locality = withParent[0];
  else if (withParent.length === 0 && settlements.length === 1)
    locality = settlements[0];
  if (!locality)
    return `"${wanted.locality}" is ${candidates.length} localities`;

  // "przysiółek Dąbrowa": a village part, never the village of that name.
  const hamlet = new RegExp(`(?:^| )przysiol[a-z]* ${name}(?: |$)`);
  if (hamlet.test(normalize(text)) && !withParent.includes(locality))
    return `"przysiółek ${wanted.locality}" without its village`;
  return locality;
}

export function resolvePlace(
  wanted: Wanted,
  text: string,
  places: ZukPlaces,
): Resolved | string {
  const scope = wanted.scope;
  let locality = pickLocality(wanted, text, places);
  if (typeof locality === "string") return locality;

  if (wanted.hamlet) {
    const hamlet = normalize(wanted.hamlet);
    const parent = locality;
    const parts = places.localities.filter(
      (l) => l.parentId === parent.id && normalize(l.name) === hamlet,
    );
    if (parts.length !== 1)
      return `no part "${wanted.hamlet}" of ${locality.name}`;
    locality = parts[0];
  }
  const parent =
    places.localities.find((l) => l.id === locality.parentId)?.name ?? null;
  const at = (streetId: string | null, street: string | null) => ({
    localityId: locality.id,
    streetId,
    label: { locality: locality.name, parent, street },
  });

  const own = places.streets.filter((s) => s.localityId === locality.id);
  if (wanted.street) {
    const street = normalize(wanted.street);
    const hits = own.filter((s) => {
      const full = normalize(s.name);
      return full === street || full.endsWith(` ${street}`);
    });
    if (hits.length !== 1)
      return `${hits.length} streets "${wanted.street}" in ${locality.name}`;
    return { places: [at(hits[0].id, hits[0].name)], scope };
  }

  if (locality.kind === "miasto") return `all of ${locality.name}`;
  // House numbers run per street, so a village-wide range would be a guess.
  if (own.length > 0 && (scope.type === "ranges" || scope.type === "numbers"))
    return `house numbers for ${locality.name}, which has streets`;
  return {
    places: [at(null, null), ...own.map((s) => at(s.id, s.name))],
    scope,
  };
}
