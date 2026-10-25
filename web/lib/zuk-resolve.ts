// A place as a ZUK post names it, mapped to our places (TERYT: the source is
// mapped to TERYT, never the other way). Pure, over our own places, not
// search: a street is looked up only among its locality's streets, a
// locality-wide cut covers the locality and every street of its own, and any
// name we cannot pin to exactly one place fails, never a fuzzy match. House
// ranges never take part in matching; they travel as the scope.

import type { Locality } from "./data-model.ts";
import type { DisruptionPlace, DisruptionScope } from "./disruptions.ts";
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
    nazwa1: string | null;
  }>;
};

/**
 * Local names TERYT does not have: the locality they lie in. Podłęże is a
 * part of Załuże, so a cut there is only part of Załuże.
 */
const ALIASES: Record<string, { locality: string; part: boolean }> = {
  [normalize("Podłęże")]: { locality: "Załuże", part: true },
  [normalize("Załuże–Podłęże")]: { locality: "Załuże", part: true },
};

export type Wanted = {
  locality: string;
  street: string | null;
  /** "(przysiółek Dąbrowa)": a village part of the locality. */
  hamlet: string | null;
  scope: DisruptionScope;
};

export type Resolved = { places: DisruptionPlace[]; scope: DisruptionScope };

export function resolvePlace(
  wanted: Wanted,
  places: ZukPlaces,
): Resolved | string {
  let scope = wanted.scope;
  const alias = ALIASES[normalize(wanted.locality)];
  const name = normalize(alias?.locality ?? wanted.locality);
  if (alias?.part && scope.type === "whole") scope = { type: "unknown" };

  const named = places.localities.filter((l) => normalize(l.name) === name);
  if (named.length === 0) return `no locality "${wanted.locality}"`;
  if (named.length > 1)
    return `"${wanted.locality}" is ${named.length} localities`;
  let locality = named[0];

  if (wanted.hamlet) {
    const hamlet = normalize(wanted.hamlet);
    const parts = places.localities.filter(
      (l) => l.parentId === locality.id && normalize(l.name) === hamlet,
    );
    if (parts.length !== 1)
      return `no part "${wanted.hamlet}" of ${locality.name}`;
    locality = parts[0];
  }

  const own = places.streets.filter((s) => s.localityId === locality.id);
  if (wanted.street) {
    const street = normalize(wanted.street);
    const hits = own.filter((s) => {
      const full = normalize(s.name);
      return (
        full === street ||
        normalize(s.nazwa1 ?? "") === street ||
        full.endsWith(` ${street}`)
      );
    });
    if (hits.length !== 1)
      return `${hits.length} streets "${wanted.street}" in ${locality.name}`;
    return {
      places: [{ localityId: locality.id, streetId: hits[0].id }],
      scope,
    };
  }

  if (locality.kind === "miasto") return `all of ${locality.name}`;
  // House numbers run per street, so a village-wide range would be a guess.
  if (own.length > 0 && (scope.type === "ranges" || scope.type === "numbers"))
    return `house numbers for ${locality.name}, which has streets`;
  return {
    places: [
      { localityId: locality.id, streetId: null },
      ...own.map((s) => ({ localityId: locality.id, streetId: s.id })),
    ],
    scope,
  };
}
