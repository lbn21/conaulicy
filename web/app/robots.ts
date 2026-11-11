import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config.generated";
import { indexable } from "@/lib/indexing";

// SEO and backlink crawlers: no use to residents, and each fetch of an
// address page is a function invocation (task 287: SE Ranking's bot made
// 22.6k on 6–7 Nov 2026 re-fetching /adres/*/woda). Jakub's decision.
export const BLOCKED_BOTS = [
  "SERankingBacklinksBot",
  "AhrefsBot",
  "SemrushBot",
  "MJ12bot",
  "DotBot",
  "BLEXBot",
  "DataForSeoBot",
  "PetalBot",
  "Barkrowler",
];

// While gated, proxy.ts answers /robots.txt itself (Disallow: /).
export default function robots(): MetadataRoute.Robots {
  if (!indexable()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: "/api/" },
      { userAgent: BLOCKED_BOTS, disallow: "/" },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
