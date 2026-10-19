import type { NextConfig } from "next";

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
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // A house number in the query (?nr=12a, ?nr=7/22) keeps the street page
  // cached: it becomes a path. Anything else in nr is left out, and the
  // plain page shows the street as it is.
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/adres/:id",
          has: [
            {
              type: "query",
              key: "nr",
              value: "(?<nr>\\d{1,4}[a-zA-Z]?(?:/\\d{1,4}[a-zA-Z]?)?)",
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
