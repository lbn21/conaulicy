import type { NextConfig } from "next";
import { NR_QUERY } from "./lib/house";

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
  async headers() {
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
};

export default nextConfig;
