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

/** Who made the site: in the footer and on „O projekcie”. */
export const AUTHOR_LINE =
  "Stronę zrobił Jakub Marciniszyn dla mieszkańców Lubaczowa i gminy.";
