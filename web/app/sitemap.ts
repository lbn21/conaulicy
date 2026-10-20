import type { MetadataRoute } from "next";

// The site's own pages. Street pages are many and change with the data; they
// are reached through search, so they are not listed here yet.
const SITE_URL = "https://conaulicy.pl";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/marka", "/dostepnosc", "/prywatnosc"].map((path) => ({
    url: `${SITE_URL}${path}`,
  }));
}
