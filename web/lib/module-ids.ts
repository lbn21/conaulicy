// The address modules' ids, with nothing imported, so a client component can
// use them without the rest of lib/address-routes.ts (which re-exports them):
// lib/address-prefetch.ts, in components/place-link.tsx's small chunk.

/**
 * Module ids in registry order. Waste comes first; water, at this address,
 * before the weather for the whole powiat.
 */
export const MODULE_IDS = ["smieci", "woda", "pogoda"] as const;

export type ModuleId = (typeof MODULE_IDS)[number];

/**
 * The modules with a subpage of their own, /adres/<id>/<module id>: the
 * others (weather) link their source instead.
 */
export const SUBPAGE_IDS: readonly ModuleId[] = ["smieci", "woda"];
