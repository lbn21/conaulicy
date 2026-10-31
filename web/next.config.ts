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
  // Cache Components (nextjs.org/docs/app/getting-started/caching): a page
  // is prerendered, what it reads cached in `use cache` scopes with a
  // cacheLife profile below and the cache tags of their data, so the crons'
  // revalidateTag purges reach it (lib/headers.ts). Partial Prefetching set
  // explicitly, as the docs ask. Next.js's own list of HTML-limited bots
  // applies: they get metadata in <head>, browsers may get it streamed
  // (/szukaj, rendered per request).
  cacheComponents: true,
  partialPrefetching: true,
  cacheLife: {
    // Every page: every one shows IMGW's warnings (the banner, or the
    // address pages' „Najbliższe dni”), so none is cached for more than 10
    // minutes; the crons also purge it by its tags. A stale copy is served
    // once more while it regenerates. As the ISR window before (route
    // segment revalidate = 600), with Next.js's default client stale time
    // (5 minutes) and expireTime (a year).
    page: { stale: 300, revalidate: 600, expire: 31_536_000 },
    // The search index's own files (the sitemap): hourly, as its data
    // cache (lib/schedule.ts CACHE), and purged with it by its tag.
    dataset: { stale: 300, revalidate: 3600, expire: 31_536_000 },
    // Request-time parts (task 218's plan, PR 3; unused so far): an expire
    // under 5 minutes keeps them out of the prerender, resolved per request
    // (nextjs.org/docs/app/api-reference/functions/cacheLife).
    live: { stale: 30, revalidate: 60, expire: 120 },
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
