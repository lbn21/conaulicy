// How a place is named and which zone it belongs to. Pure functions, shared
// by the pages (lib/schedule.ts) and the importer (localities.search), so
// what search matches is what the page shows.

import type { Locality } from "./data-model.ts";

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
};

/**
 * The zone of a street or village: its own street entry first, then its
 * locality's, then the parent village's (a village part without an entry of
 * its own takes its village's zone, docs/data-model.md).
 */
export function pickZone(
  candidates: ZoneCandidate[],
  place: { localityId: string; parentId: string | null; streetId?: string },
): string | null {
  const rank = (c: ZoneCandidate) => {
    if (c.streetId !== null) return c.streetId === place.streetId ? 0 : -1;
    if (c.localityId === place.localityId) return 1;
    if (c.localityId === place.parentId) return 2;
    return -1;
  };
  const best = candidates
    .map((c) => ({ c, rank: rank(c) }))
    .filter(({ rank }) => rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.c.zoneId.localeCompare(b.c.zoneId))[0];
  return best?.c.zoneId ?? null;
}
