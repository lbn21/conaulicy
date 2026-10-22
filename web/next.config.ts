import type { NextConfig } from "next";
import { SITE_URL } from "./lib/config.generated";
import { NR_QUERY } from "./lib/house";
import { indexable } from "./lib/indexing";

const nextConfig: NextConfig = {
  // PDFKit reads its own data files from __dirname, so it must stay a real
  // node_modules package instead of being bundled. Costs about 0.45 KB in the
  // shared Turbopack client runtime; bundling works today only because the
  // route never loads a standard font.
  serverExternalPackages: ["pdfkit"],
  // The PDF route reads the TTF fonts with fs at runtime.
  outputFileTracingIncludes: {
    "/adres/[id]/harmonogram.pdf": ["./assets/fonts/*.ttf"],
  },
  // A house number in the query (?nr=12a, ?nr=7/22) keeps the street page
  // cached: it becomes a path. Any other ?nr= is routed by proxy.ts (a
  // rewrite cannot see an empty value).
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/adres/:id",
          has: [
            {
              type: "query",
              key: "nr",
              value: `(?<nr>${NR_QUERY})`,
            },
          ],
          destination: "/adres/:id/nr/:nr",
        },
      ],
    };
  },
  // headers() and redirects() are evaluated at build time (baked into the
  // routes manifest). On Vercel VERCEL_ENV and SITE_BASIC_AUTH are set at
  // build, so this is right, but changing SITE_BASIC_AUTH needs a redeploy
  // to flip indexing (see lib/indexing.ts; pages rendered on demand read it
  // at runtime, which on Vercel sees the same values).
  async headers() {
    if (indexable()) return [];
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow",
          },
        ],
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

export default nextConfig;
