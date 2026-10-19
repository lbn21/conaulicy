// How a place is named and which zone it belongs to. Pure functions, shared
// by the pages (lib/schedule.ts) and the importer (localities.search), so
// what search matches is what the page shows.

import type { Locality } from "./data-model.ts";
import { type HouseRange, inRange, isPartial } from "./house.ts";

export function gminaShortName(name: string): string {
  return name.replace(/\s*\(.*\)$/, "");
}

/**
 * A village as a place. Village parts name their village, because some names
 * repeat in the gmina: "Dąbrowa (Basznia Górna, gm. Lubaczów)".
 */
export function villageLabel(village: {
  name: string;
  parent: string | null;
  gmina: string;
}): string {
  const gmina = `gm. ${gminaShortName(village.gmina)}`;
  return village.parent
    ? `${village.name} (${village.parent}, ${gmina})`
    : `${village.name} (${gmina})`;
}

/** What localities.search holds: the town itself, or the village label. */
export function localitySearchLabel(locality: {
  name: string;
  kind: Locality["kind"];
  parent: string | null;
  gmina: string;
}): string {
  return locality.kind === "miasto" ? locality.name : villageLabel(locality);
}

// Who publishes each gmina's schedule, in the genitive for "harmonogram …".
const SCHEDULE_OWNERS: Record<string, string> = {
  "Lubaczów (miasto)": "Urzędu Miejskiego w Lubaczowie",
  "Lubaczów (gmina)": "Urzędu Gminy Lubaczów",
};

/** "harmonogram Urzędu Gminy Lubaczów": a source link names its publisher. */
export function scheduleName(gmina: string): string {
  const owner = SCHEDULE_OWNERS[gmina];
  return owner
    ? `harmonogram ${owner}`
    : `harmonogram gminy ${gminaShortName(gmina)}`;
}

// TERYT names some streets in full, e.g. "os." + "Osiedle Mickiewicza".
const PREFIX_WORDS: Record<string, string> = {
  "ul.": "ulica",
  "os.": "osiedle",
  "al.": "aleja",
  rondo: "rondo",
  skwer: "skwer",
};

/** "ul. Adama Asnyka", but "Osiedle Mickiewicza" rather than "os. Osiedle …". */
export function streetName(prefix: string, name: string): string {
  const word = PREFIX_WORDS[prefix];
  return word && name.toLowerCase().startsWith(`${word} `)
    ? name
    : `${prefix} ${name}`;
}

export function streetLabel(street: {
  prefix: string;
  name: string;
  locality: string;
}): string {
  return `${streetName(street.prefix, street.name)}, ${street.locality}`;
}

/** Not offered in search (nobody lives there); a direct link still works. */
export const UNLISTED_PREFIXES = ["rondo", "skwer"];

export type ZoneCandidate = {
  zoneId: string;
  localityId: string;
  streetId: string | null;
} & Partial<HouseRange>;

type ZonePlace = {
  localityId: string;
  parentId: string | null;
  streetId?: string;
  /** A valid house number (lib/house.ts), if the visitor gave one. */
  nr?: string | null;
};

const range = (c: ZoneCandidate): HouseRange => ({
  houseFrom: c.houseFrom ?? null,
  houseTo: c.houseTo ?? null,
  parity: c.parity ?? null,
});

/** A street whose house numbers are in different zones. */
export function isSplitStreet(
  candidates: ZoneCandidate[],
  place: ZonePlace,
): boolean {
  return candidates.some(
    (c) =>
      place.streetId !== undefined &&
      c.streetId === place.streetId &&
      isPartial(range(c)),
  );
}

/**
 * The zone of a street or village: the street entry covering the house
 * number, then the whole street's entry, then its locality's, then the
 * parent village's (a village part without an entry of its own takes its
 * village's zone, docs/data-model.md). On a split street without a number:
 * none, never a guess.
 */
export function pickZone(
  candidates: ZoneCandidate[],
  place: ZonePlace,
): string | null {
  if (!place.nr && isSplitStreet(candidates, place)) return null;
  const rank = (c: ZoneCandidate) => {
    if (c.streetId !== null) {
      if (c.streetId !== place.streetId) return -1;
      if (!isPartial(range(c))) return 1;
      return place.nr && inRange(place.nr, range(c)) ? 0 : -1;
    }
    if (c.localityId === place.localityId) return 2;
    if (c.localityId === place.parentId) return 3;
    return -1;
  };
  const best = candidates
    .map((c) => ({ c, rank: rank(c) }))
    .filter(({ rank }) => rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.c.zoneId.localeCompare(b.c.zoneId))[0];
  return best?.c.zoneId ?? null;
}
