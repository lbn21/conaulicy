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
 * The address's files, /adres/<id>/<file>: route folders under
 * app/adres/[id]/, which take ?nr= as the subpages do.
 */
export const FILE_NAMES = ["harmonogram.pdf", "woda.ics"];

/**
 * Folders under app/adres/[id]/ that win over app/adres/[id]/[module]/, so no
 * module may be called this.
 */
export const RESERVED_SEGMENTS = ["nr", "numer", ...FILE_NAMES];

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
 * A subpage or file after a house number (/adres/<id>/nr/5/woda,
 * /adres/<id>/nr/5/woda.ics) is no page of its own: it goes to the base
 * address's one with the number in the query. Two rules, as a number has at
 * most one slash ("7/22"): a repeated param (:nr+) cannot go into a
 * destination's query (next.config.ts redirects()).
 */
export function numberRedirects() {
  const names = [...SUBPAGE_IDS, ...FILE_NAMES].map((name) =>
    name.replaceAll(".", "\\."),
  );
  const module = `:module(${names.join("|")})`;
  return [
    {
      source: `/adres/:id/nr/:nr/${module}`,
      destination: "/adres/:id/:module?nr=:nr",
      permanent: true,
    },
    {
      source: `/adres/:id/nr/:nr/:flat/${module}`,
      destination: "/adres/:id/:module?nr=:nr/:flat",
      permanent: true,
    },
  ];
}

/**
 * The value of a /nr/… path, as given: its segments decoded (a page's
 * params keep the encoding, "%2B44" for "+44") and joined ("7/22").
 */
export function numberParam(segments: string[]): string {
  return segments
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join("/");
}

/**
 * The page's own error variant (/adres/<id>/numer, /adres/<id>/smieci/numer)
 * for an address asked with an empty ?nr=; with any other value not in
 * NR_QUERY's shape, its number variant (/adres/<id>/nr/<value>), which
 * checks the value (lib/prg.ts isValidHouseNumber) and shows it; or null.
 */
export function numberErrorPath(pathname: string, nr = ""): string | null {
  const match = ADDRESS.exec(pathname);
  if (!match) return null;
  return nr ? `${match[1]}/nr/${encodeURIComponent(nr)}` : `${match[1]}/numer`;
}
