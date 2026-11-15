// The site's own pages besides the home page, with their title (the h1 and
// the footer link text). The sitemap, the footer and the links between
// pages all read them from here.
type StaticPage = { path: string; text: string };

export const ALL_PLACES: StaticPage = {
  path: "/ulice",
  text: "Wszystkie ulice i wsie",
};
export const ACCESSIBILITY: StaticPage = {
  path: "/dostepnosc",
  text: "Dostępność",
};
export const PRIVACY: StaticPage = { path: "/prywatnosc", text: "Prywatność" };
export const ABOUT: StaticPage = { path: "/o-projekcie", text: "O projekcie" };

/** In footer order. */
export const STATIC_PAGES: ReadonlyArray<StaticPage> = [
  ALL_PLACES,
  ACCESSIBILITY,
  PRIVACY,
  ABOUT,
];

/**
 * The gmina-wide outage pages (app/woda, app/prad): every water cut and
 * power outage of the whole gmina, at the slugs of the address's own
 * subpages (/adres/<id>/woda, /prad). Not in STATIC_PAGES (the footer's
 * helper links): the routes, the sitemap and the keep-warm read them here.
 */
const GMINA_OUTAGE_SLUGS = ["woda", "prad"] as const;

export type GminaOutageSlug = (typeof GMINA_OUTAGE_SLUGS)[number];

/** Each page's path by its slug: the one source; a slug without one is a type error. */
export const GMINA_OUTAGE_PATH = {
  woda: "/woda",
  prad: "/prad",
} as const satisfies Record<GminaOutageSlug, `/${string}`>;

/** The same, in order, for the lists (the sitemap, the checks). */
export const GMINA_OUTAGE_PAGES = GMINA_OUTAGE_SLUGS.map((slug) => ({
  slug,
  path: GMINA_OUTAGE_PATH[slug],
}));

/** Who made the site: in the footer and on „O projekcie”. */
export const AUTHOR_LINE =
  "Stronę zrobił Jakub Marciniszyn dla mieszkańców Lubaczowa i gminy.";
