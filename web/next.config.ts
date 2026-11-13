import { existsSync, readFileSync } from "node:fs";
import type { NextConfig } from "next";
import { SITE_URL } from "./lib/config.generated";
import { headerList, SECURITY } from "./lib/headers";
import { indexable, NOINDEX, NOINDEX_NOFOLLOW } from "./lib/indexing";

// The dataset snapshot this build is made from, written by the prebuild
// step (scripts/dataset-build.ts, .dataset-build.json, not in git): its
// version and place set, inlined as DATASET_BUILD (lib/dataset.ts reads
// only that version during the build), and its renamed places' redirects.
// None (`next dev`): every version is its own, and no redirects.
type BuildFile = {
  version: string;
  placeSet: string;
  redirects: Record<string, string>;
};
const BUILD_FILE = new URL("./.dataset-build.json", import.meta.url);
const build: BuildFile | null = existsSync(BUILD_FILE)
  ? JSON.parse(readFileSync(BUILD_FILE, "utf8"))
  : null;

const nextConfig: NextConfig = {
  // No x-powered-by on any response.
  poweredByHeader: false,
  // PDFKit reads its own data files from __dirname, so it must stay a real
  // node_modules package instead of being bundled. Costs about 0.45 KB in the
  // shared Turbopack client runtime; bundling works today only because the
  // route never loads a standard font. fontkit, which the PDF route also
  // measures ink with, stays the one copy PDFKit itself loads.
  serverExternalPackages: ["pdfkit", "fontkit"],
  // Every page and file is prerendered whole at build, with
  // generateStaticParams and dynamicParams = false on every dynamic
  // route: only what the build made exists, every other URL is the
  // prerendered 404 from Vercel's routing layer, no function run. Cache
  // Components stays off: with it, dynamicParams = false is not available
  // and an unknown id would render on request
  // (nextjs.org/docs/app/api-reference/file-conventions/route-segment-config/dynamicParams).
  // Pages refresh by tag (lib/page-cache.ts).
  env: build
    ? {
        DATASET_BUILD: JSON.stringify({
          version: build.version,
          placeSet: build.placeSet,
        }),
      }
    : {},
  // The PDF route reads the TTF fonts with fs.
  outputFileTracingIncludes: {
    "/adres/[id]/harmonogram.pdf": ["./assets/fonts/*.ttf"],
  },
  // headers() and redirects() are evaluated at build time (baked into the
  // routes manifest). The security headers (lib/headers.ts) on every path;
  // a build that is not indexable says so on every response; the street
  // PDFs and calendars are never search results.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: headerList(
          indexable() ? SECURITY : { ...SECURITY, ...NOINDEX_NOFOLLOW },
        ),
      },
      ...[
        "/adres/:id/harmonogram.pdf",
        "/adres/:id/woda.ics",
        "/ics/:zoneId",
      ].map((source) => ({ source, headers: headerList(NOINDEX) })),
    ];
  },
  // The Vercel address goes to the permanent one, path and query kept. Only
  // this host: preview URLs (conaulicy-git-*.vercel.app) keep working. 308
  // keeps the method, so a POST /api/revalidate still arrives. Then every
  // renamed place of this build's snapshot: its page and everything under
  // it, 308 to the new id, made by the same build as the pages, so they
  // always match.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "conaulicy.vercel.app" }],
        destination: `${SITE_URL}/:path*`,
        permanent: true,
      },
      ...Object.entries(build?.redirects ?? {}).flatMap(([from, to]) => [
        {
          source: `/adres/${encodeURIComponent(from)}`,
          destination: `/adres/${encodeURIComponent(to)}`,
          permanent: true,
        },
        {
          source: `/adres/${encodeURIComponent(from)}/:path*`,
          destination: `/adres/${encodeURIComponent(to)}/:path*`,
          permanent: true,
        },
      ]),
    ];
  },
};

// The palette's Sass, icons and share card (not in git) and the build's
// snapshot are written before Next.js starts, by npm's predev and prebuild
// (scripts/brand-assets.ts, scripts/dataset-build.ts), so loading this
// config writes nothing.
export default nextConfig;
