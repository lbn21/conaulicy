// The address page's URLs: the page itself (/adres/<id>) and one subpage per
// module (/adres/<id>/<module>), each with a house-number variant (/nr/…) and
// an error variant (/numer). Pure, so the unit tests, next.config.ts,
// proxy.ts and lib/clean-query.ts share one list (lib/modules.ts is the
// registry; it needs Next.js, so it cannot be loaded here).
import { NR_QUERY } from "./house.ts";

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

/**
 * Folders under app/adres/[id]/ that win over app/adres/[id]/[module]/, so no
 * module may be called this.
 */
export const RESERVED_SEGMENTS = ["nr", "numer", "harmonogram.pdf", "woda.ics"];

export function isModuleId(slug: string): slug is ModuleId {
  return (MODULE_IDS as readonly string[]).includes(slug);
}

const MODULE = `(?:/(?:${SUBPAGE_IDS.join("|")}))?`;

/** /adres/<id> or /adres/<id>/<module>, which take ?nr=. */
export const ADDRESS = new RegExp(`^(/adres/[^/]+${MODULE})/?$`);

/** Their house-number and error variants, which take no query. */
export const ADDRESS_VARIANTS = [
  new RegExp(`^/adres/[^/]+${MODULE}/nr(?:/[^/]+)+$`),
  new RegExp(`^/adres/[^/]+${MODULE}/numer$`),
];

/**
 * A house number in the query (?nr=12a, ?nr=7/22) keeps the page cached: it
 * becomes a path (next.config.ts). Any other ?nr= goes to numberErrorPath.
 */
export const NUMBER_REWRITES = [
  { source: "/adres/:id", destination: "/adres/:id/nr/:nr" },
  {
    source: `/adres/:id/:module(${SUBPAGE_IDS.join("|")})`,
    destination: "/adres/:id/:module/nr/:nr",
  },
].map((rule) => ({
  ...rule,
  has: [{ type: "query" as const, key: "nr", value: `(?<nr>${NR_QUERY})` }],
}));

/**
 * The page's own error variant (/adres/<id>/numer, /adres/<id>/smieci/numer)
 * for an address asked with ?nr= but no usable number, or null.
 */
export function numberErrorPath(pathname: string): string | null {
  const match = ADDRESS.exec(pathname);
  return match ? `${match[1]}/numer` : null;
}
