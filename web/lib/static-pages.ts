// The site's own pages besides the home page, in footer order, with their
// footer link text. The sitemap, the footer and proxy.ts's clean-URL
// redirect (lib/clean-query.ts) all list them from here.
export const STATIC_PAGES: ReadonlyArray<{ path: string; text: string }> = [
  { path: "/ulice", text: "Wszystkie ulice i wsie" },
  { path: "/dostepnosc", text: "Dostępność" },
  { path: "/prywatnosc", text: "Prywatność" },
  { path: "/o-projekcie", text: "O projekcie" },
];
