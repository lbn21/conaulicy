// What a production build tells search engines, without a second build in
// CI (task 252): next.config.ts headers() and redirects() and app/robots.ts
// read lib/indexing.ts at call time, as `next build` calls them, so each is
// called here under both settings. scripts/check-indexing.mjs
// --expect=noindex checks the CI build as served; --expect=index stays a
// manual check before launch (docs/launch.md).
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import robots from "../app/robots.ts";
import nextConfig from "../next.config.ts";
import { SECURITY } from "./headers.ts";

const saved = {
  VERCEL_ENV: process.env.VERCEL_ENV,
  SITE_BASIC_AUTH: process.env.SITE_BASIC_AUTH,
};
afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
const as = (env: "production" | "preview") => {
  process.env.VERCEL_ENV = env;
  delete process.env.SITE_BASIC_AUTH;
};
const headersOf = async () => {
  const rules = (await nextConfig.headers?.()) ?? [];
  assert.equal(rules.length, 1);
  assert.equal(rules[0].source, "/:path*");
  return Object.fromEntries(rules[0].headers.map((h) => [h.key, h.value]));
};

test("indexable: the security headers on every path, no X-Robots-Tag", async () => {
  as("production");
  assert.deepEqual(await headersOf(), SECURITY);
});

test("not indexable: the security headers and noindex, nofollow", async () => {
  for (const set of [
    () => as("preview"),
    () => {
      as("production");
      process.env.SITE_BASIC_AUTH = "u:p";
    },
  ]) {
    set();
    assert.deepEqual(await headersOf(), {
      ...SECURITY,
      "X-Robots-Tag": "noindex, nofollow",
    });
  }
});

test("conaulicy.vercel.app goes to conaulicy.pl, path and query kept, only that host", async () => {
  for (const env of ["production", "preview"] as const) {
    as(env);
    const vercel = ((await nextConfig.redirects?.()) ?? []).filter((rule) =>
      rule.has?.some((h) => h.type === "host"),
    );
    assert.deepEqual(vercel, [
      {
        source: "/:path*",
        has: [{ type: "host", value: "conaulicy.vercel.app" }],
        destination: "https://conaulicy.pl/:path*",
        permanent: true,
      },
    ]);
  }
});

test("robots.txt: open but /api/ with the sitemap when indexable, else closed", () => {
  as("production");
  assert.deepEqual(robots(), {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: "https://conaulicy.pl/sitemap.xml",
  });
  as("preview");
  assert.deepEqual(robots(), { rules: { userAgent: "*", disallow: "/" } });
});
