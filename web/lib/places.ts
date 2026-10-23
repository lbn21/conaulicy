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

/**
 * TERYT's street types (CECHA, the ULIC dictionary) and the word each stands
 * for: one table for labels and search. TERYT names some streets in full,
 * e.g. "os." + "Osiedle Mickiewicza".
 */
export const CECHA_WORDS: Record<string, string> = {
  "ul.": "ulica",
  "al.": "aleja",
  "pl.": "plac",
  skwer: "skwer",
  "bulw.": "bulwar",
  rondo: "rondo",
  park: "park",
  rynek: "rynek",
  szosa: "szosa",
  droga: "droga",
  "os.": "osiedle",
  ogród: "ogród",
  wyspa: "wyspa",
  "wyb.": "wybrzeże",
};

/**
 * A street's name as GUS composes it from ULIC: NAZWA_2 (the beginning,
 * e.g. "Adama") then NAZWA_1 (the key part, e.g. "Asnyka"); the CECHA goes
 * in front (streetName). GUS, zasady implementacji słowników TERYT.
 */
export function terytName(nazwa1: string, nazwa2: string | null): string {
  return nazwa2 ? `${nazwa2} ${nazwa1}` : nazwa1;
}

/** "ul. Adama Asnyka", but "Osiedle Mickiewicza" rather than "os. Osiedle …". */
export function streetName(prefix: string, name: string): string {
  const word = CECHA_WORDS[prefix];
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

/**
 * A moved place's path (place_redirects): /adres/<oldId> and everything
 * under it (/harmonogram.pdf, /nr/…, /numer), query included, on newId.
 * Null for any other path.
 */
export function movedPath(
  path: string,
  oldId: string,
  newId: string,
): string | null {
  const old = `/adres/${encodeURIComponent(oldId)}`;
  if (
    path !== old &&
    !path.startsWith(`${old}/`) &&
    !path.startsWith(`${old}?`)
  )
    return null;
  return `/adres/${encodeURIComponent(newId)}${path.slice(old.length)}`;
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
 * village's zone, docs/database.md). On a split street without a number:
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

/**
 * Whether we have pickup data for a place: a zone of its own, its locality's
 * or its village's, or (a split street) zones for parts of it. Candidates may
 * be every zone member: pickZone ignores other places' entries.
 */
export function hasZone(
  candidates: ZoneCandidate[],
  place: ZonePlace,
): boolean {
  return (
    isSplitStreet(candidates, place) || pickZone(candidates, place) !== null
  );
}

export type ListedPlace = { id: string; label: string };

/** /ulice's list: the town's streets by first letter, then the villages. */
export type PlaceList = {
  town: Array<{ letter: string; places: ListedPlace[] }>;
  /** A village is a place, or (with streets of its own) holds its streets. */
  villages: Array<{ id: string | null; label: string; streets: ListedPlace[] }>;
};

const collator = new Intl.Collator("pl");

/** "A", "Ł", "Ż"; streets named from a number ("3 Maja") under "0–9". */
function letterOf(name: string): string {
  const letter = name.charAt(0).toLocaleUpperCase("pl");
  return /\d/.test(letter) ? "0–9" : letter;
}

/**
 * The search index's places for /ulice, in Polish order (Ł after L, Ż at the
 * end): town streets by their own name, not the prefix; villages by name,
 * village streets under their village. Labels drop the town or village name
 * where the heading or the village already says it.
 */
export function placeList(
  streets: Array<{
    id: string;
    prefix: string;
    name: string;
    localityId: string;
    locality: string;
    localityKind: Locality["kind"];
  }>,
  villages: Array<{
    id: string;
    name: string;
    parent: string | null;
    gmina: string;
  }>,
): PlaceList {
  const byName = <T extends { name: string; label: string }>(a: T, b: T) =>
    collator.compare(a.name, b.name) || collator.compare(a.label, b.label);
  const listed = (s: (typeof streets)[number]) => ({
    id: s.id,
    name: s.name,
    label: streetName(s.prefix, s.name),
  });

  const town: PlaceList["town"] = [];
  for (const street of streets
    .filter((s) => s.localityKind === "miasto")
    .map(listed)
    .sort(byName)) {
    const letter = letterOf(street.name);
    if (town.at(-1)?.letter !== letter) town.push({ letter, places: [] });
    town.at(-1)?.places.push({ id: street.id, label: street.label });
  }

  const withStreets = new Map<
    string,
    { name: string; label: string; streets: ReturnType<typeof listed>[] }
  >();
  for (const street of streets.filter((s) => s.localityKind !== "miasto")) {
    const village = withStreets.get(street.localityId) ?? {
      name: street.locality,
      label: street.locality,
      streets: [],
    };
    village.streets.push(listed(street));
    withStreets.set(street.localityId, village);
  }
  const groups = [
    ...villages.map((v) => ({
      id: v.id,
      name: v.name,
      label: villageLabel(v),
      streets: [] as ReturnType<typeof listed>[],
    })),
    ...[...withStreets.values()].map((v) => ({ id: null, ...v })),
  ].sort(byName);

  return {
    town,
    villages: groups.map(({ id, label, streets }) => ({
      id,
      label,
      streets: streets.sort(byName).map(({ id, label }) => ({ id, label })),
    })),
  };
}
