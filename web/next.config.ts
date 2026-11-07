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
  // page is a static shell cached for the longest time, cacheLife "max"
  // (nextjs.org/docs/app/api-reference/functions/cacheLife), so until the
  // next deploy, or the import's purge of the dataset tag for those built
  // from the database (app/api/revalidate). What changes between imports
  // (IMGW, water, „Najbliższe dni”) is never in a shell: the IMGW row is
  // its own <Suspense> hole, and the address pages are read per request,
  // whole, behind one skeleton (components/live-block.tsx,
  // components/place-suspense.tsx).
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
