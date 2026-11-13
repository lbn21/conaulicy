import type { NextConfig } from "next";
import { SITE_URL } from "./lib/config.generated";
import { headerList, SECURITY } from "./lib/headers";
import { indexable, NOINDEX_NOFOLLOW } from "./lib/indexing";

const nextConfig: NextConfig = {
  // No x-powered-by on any response.
  poweredByHeader: false,
  // PDFKit reads its own data files from __dirname, so it must stay a real
  // node_modules package instead of being bundled. Costs about 0.45 KB in the
  // shared Turbopack client runtime; bundling works today only because the
  // route never loads a standard font. fontkit, which the PDF route also
  // measures ink with, stays the one copy PDFKit itself loads.
  serverExternalPackages: ["pdfkit", "fontkit"],
  // Cache Components (nextjs.org/docs/app/getting-started/caching): every
  // page is prerendered whole, its data in the HTML, never a skeleton on a
  // load. What comes from the dataset snapshot is cached for the longest
  // time, cacheLife "max" (nextjs.org/docs/app/api-reference/functions/cacheLife),
  // until the next deploy or the import's purge of the dataset tag
  // (app/api/revalidate). What the crons write (IMGW, PGE, water, the
  // checks) and what counts from today („Teraz w gminie”, „Najbliższe 7
  // dni”) is cached as "live" below, tagged LIVE (lib/headers.ts), and
  // each cron purges that tag after it writes (app/api/cron/zuk). Only a
  // request's own input (?nr=, ?imgw=: proxy.ts sends those to their
  // routes under app/adres/[id]/nr/) is read per request, behind a
  // skeleton (components/place-suspense.tsx).
  // Partial Prefetching set explicitly, as the docs ask. Next.js's own list
  // of HTML-limited bots applies: they get metadata in <head>.
  cacheComponents: true,
  partialPrefetching: true,
  cacheLife: {
    // The search index's own files (the sitemap): hourly, and purged with
    // the dataset snapshot (lib/dataset.ts) by its tag.
    dataset: { stale: 300, revalidate: 3600, expire: 31_536_000 },
    // The crons' data and what counts from today: refreshed in the
    // background at most a minute after it is served, and at once when a
    // cron purges LIVE. Prerendered, and in the route's App Shell: revalidate
    // above 0, expire and stale at least 5 minutes (cacheLife, "Prerendering
    // behavior": a revalidate of 0 or an expire under 5 minutes is a
    // dynamic hole; a stale under 5 minutes leaves the App Shell).
    live: { stale: 300, revalidate: 60, expire: 3600 },
  },
  // The PDF route reads the TTF fonts with fs at runtime.
  outputFileTracingIncludes: {
    "/adres/[id]/harmonogram.pdf": ["./assets/fonts/*.ttf"],
  },
  // headers() and redirects() are evaluated at build time (baked into the
  // routes manifest). On Vercel VERCEL_ENV and SITE_BASIC_AUTH are set at
  // build, so this is right, but changing SITE_BASIC_AUTH needs a redeploy
  // to flip indexing (see lib/indexing.ts; pages rendered on demand read it
  // at runtime, which on Vercel sees the same values).
  // The security headers (lib/headers.ts) on every path, either way.
  async headers() {
    if (indexable()) {
      return [
        {
          source: "/:path*",
          headers: headerList(SECURITY),
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
  // keeps the method, so a POST /api/revalidate still arrives.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "conaulicy.vercel.app" }],
        destination: `${SITE_URL}/:path*`,
        permanent: true,
      },
    ];
  },
};

// The palette's Sass, icons and share card (not in git) are written before
// Next.js starts, by npm's predev and prebuild (scripts/brand-assets.ts), so
// loading this config writes nothing.
export default nextConfig;
