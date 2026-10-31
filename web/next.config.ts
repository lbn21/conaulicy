import type { NextConfig } from "next";
import { NUMBER_REWRITES, numberRedirects } from "./lib/address-routes";
import { SITE_URL } from "./lib/config.generated";
import { headerList, SECURITY } from "./lib/headers";
import { indexable, NOINDEX, NOINDEX_NOFOLLOW } from "./lib/indexing";
import { writeBrandAssets } from "./scripts/brand-assets";

const nextConfig: NextConfig = {
  // No x-powered-by on any response.
  poweredByHeader: false,
  // PDFKit reads its own data files from __dirname, so it must stay a real
  // node_modules package instead of being bundled. Costs about 0.45 KB in the
  // shared Turbopack client runtime; bundling works today only because the
  // route never loads a standard font.
  serverExternalPackages: ["pdfkit"],
  // Cache Components (nextjs.org/docs/app/getting-started/caching): every
  // page is a static shell cached for the longest time, cacheLife "max"
  // (nextjs.org/docs/app/api-reference/functions/cacheLife), so until the
  // next deploy, or the import's purge of the dataset tag for those built
  // from the database (app/api/revalidate). What changes between imports
  // (IMGW, water, „Najbliższe dni”) is never in a shell: each block is its
  // own <Suspense> hole, read per request (components/live-block.tsx).
  // Partial Prefetching set explicitly, as the docs ask. Next.js's own list
  // of HTML-limited bots applies: they get metadata in <head>.
  cacheComponents: true,
  partialPrefetching: true,
  cacheLife: {
    // The search index's own files (the sitemap): hourly, as its data
    // cache (lib/schedule.ts CACHE), and purged with it by its tag.
    dataset: { stale: 300, revalidate: 3600, expire: 31_536_000 },
  },
  // The PDF route reads the TTF fonts with fs at runtime.
  outputFileTracingIncludes: {
    "/adres/[id]/harmonogram.pdf": ["./assets/fonts/*.ttf"],
  },
  // A house number in the query (?nr=12a, ?nr=7/22) keeps the street page
  // and its module subpages cached: it becomes a path. Any other ?nr= is
  // routed by proxy.ts (a rewrite cannot see an empty value).
  async rewrites() {
    return { beforeFiles: NUMBER_REWRITES };
  },
  // headers() and redirects() are evaluated at build time (baked into the
  // routes manifest). On Vercel VERCEL_ENV and SITE_BASIC_AUTH are set at
  // build, so this is right, but changing SITE_BASIC_AUTH needs a redeploy
  // to flip indexing (see lib/indexing.ts; pages rendered on demand read it
  // at runtime, which on Vercel sees the same values).
  // The security headers (lib/headers.ts) on every path, either way.
  async headers() {
    // Search results are never search results (also meta robots).
    if (indexable()) {
      return [
        {
          source: "/:path*",
          headers: headerList(SECURITY),
        },
        {
          source: "/szukaj",
          headers: headerList(NOINDEX),
        },
      ];
    }
    return [
      {
        source: "/:path*",
        headers: headerList({ ...SECURITY, ...NOINDEX_NOFOLLOW }),
      },
    ];
  },
  // The Vercel address goes to the permanent one, path and query kept. Only
  // this host: preview URLs (conaulicy-git-*.vercel.app) keep working. 308
  // keeps the method, so a POST /api/revalidate still arrives. A subpage or
  // file after a house number goes to the base address's one
  // (lib/address-routes.ts numberRedirects).
  async redirects() {
    return [
      ...numberRedirects(),
      {
        source: "/:path*",
        has: [{ type: "host", value: "conaulicy.vercel.app" }],
        destination: `${SITE_URL}/:path*`,
        permanent: true,
      },
    ];
  },
};

// The palette's Sass, icons and share card (not in git), before Next.js reads
// app/ and public/; redrawn only when the palette or its generator changed
// (scripts/brand-assets.ts).
export default async function config(): Promise<NextConfig> {
  await writeBrandAssets();
  return nextConfig;
}
