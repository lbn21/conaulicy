// A TERYT part (a SIMC with a parent) whose addresses are, in PRG, all on
// streets of its village: the part's page gets those streets' water cuts
// (lib/water-module.ts matches). Code, not data: each link checked by hand.
//
// Pilipy (SIMC 0606300, część wsi Młodów 0606286): PRG address points,
// GUGiK, 2026-10-23, have no point with SIMC 0606300; all 24 Pilipy
// addresses are 'Młodów, ul. Pilipy N' (ULIC 39507), centroid 90 m from the
// part's point, farthest 236 m. Not a name rule: Mazury and Piaski
// (Lubaczów) must NOT be linked (task 182 check).
//
// TODO(Smolińce 0606257 -> 0606234-27260): add after a map/PRG check, Jakub to confirm.

/**
 * A linked street's village in the locative, written by hand (code never
 * declines a name): "ulica Pilipy w Młodowie". Without one, "w
 * miejscowości Młodów".
 */
export const VILLAGE_IN: ReadonlyMap<string, string> = new Map([
  ["0606286", "w Młodowie"],
]);

/** A part's SIMC → the streets (SIMC-SYM_UL) of its village it is on. */
export const PART_STREETS: ReadonlyMap<string, readonly string[]> = new Map([
  ["0606300", ["0606286-39507"]],
]);
