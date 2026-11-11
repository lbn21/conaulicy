// The address modules' ids, with nothing imported, so a client component can
// use them without the rest of lib/address-routes.ts (which re-exports them):
// lib/address-prefetch.ts, in components/place-link.tsx's small chunk.

/**
 * Module ids in registry order. Waste comes first; water and power, at
 * this address, before the weather for the whole powiat.
 */
export const MODULE_IDS = ["smieci", "woda", "prad", "pogoda"] as const;

export type ModuleId = (typeof MODULE_IDS)[number];

/**
 * The modules with a subpage of their own, /adres/<id>/<module id>. The
 * weather has none: its warnings are cards on the address page.
 */
export const SUBPAGE_IDS: readonly ModuleId[] = ["smieci", "woda", "prad"];
