import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { datasetHeaders } from "./gate.ts";
import { DATASET } from "./headers.ts";

// The caching model (next.config.ts, docs/perf.md): every page is a static
// shell cached for the longest time (cacheLife "max"); the shells built
// from the database are tagged DATASET, which only an import purges
// (app/api/revalidate). What changes between imports (IMGW, water,
// „Najbliższe dni”) is never in a shell: each block reads its Blob file per
// request through the Blob's CDN, after io(), in its own hole. No cron
// purges anything.

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

const root = new URL("../", import.meta.url);
const sources = ["app", "components", "lib"]
  .flatMap((dir) =>
    readdirSync(new URL(dir, root), {
      recursive: true,
      encoding: "utf8",
    }).map((path) => `${dir}/${path}`),
  )
  .filter((path) => /\.tsx?$/.test(path) && !/\.test\.ts$/.test(path))
  .sort();
const calling = (pattern: RegExp) =>
  sources.filter((path) =>
    pattern.test(readFileSync(new URL(path, root), "utf8")),
  );

test("datasetHeaders: the one tag, DATASET", () => {
  assert.equal(DATASET, "dataset");
  assert.equal(datasetHeaders()["Vercel-Cache-Tag"], "dataset");
  assert.equal(
    datasetHeaders("public, s-maxage=3600")["Cache-Control"],
    "public, s-maxage=3600",
  );
});

test("the only purge is the import's, of DATASET", () => {
  assert.deepEqual(calling(/\brevalidateTag\(/), [
    "app/api/revalidate/route.ts",
  ]);
  assert.match(
    read("../app/api/revalidate/route.ts"),
    /revalidateTag\(DATASET, \{ expire: 0 \}\);/,
  );
  assert.doesNotMatch(
    read("../app/api/cron/zuk/route.ts"),
    /purge:|revalidateTag/,
  );
  assert.doesNotMatch(read("./zuk-cron.ts"), /purge\(/);
});

test("the crons' files: no Next cache in front of them; the pages read the Blob's CDN, the crons its origin", () => {
  const store = read("./live-store.ts");
  const zuk = read("./zuk-store.ts");
  assert.doesNotMatch(store, /unstable_cache|cacheTag/);
  assert.doesNotMatch(zuk, /unstable_cache|cacheTag/);
  assert.match(store, /useCache: cdn,/);
  assert.match(store, /readBlobFile\(FEED_PATH, \{ cdn: true \}\)/);
  assert.match(store, /readBlobFile\(CHECKS_PATH, \{ cdn: true \}\)/);
  assert.match(zuk, /readBlobFile\(source\.pathname, \{ cdn: true \}\)/);
  // The crons: the origin, so a run compares with the last write.
  assert.match(zuk, /return readBlobFile\(pathname\);/);
  assert.match(
    read("../app/api/cron/zuk/route.ts"),
    /readFeed: \(\) => readBlobFile\(FEED_PATH\),/,
  );
  // Written with the minimum CDN lifetime, 60 s.
  assert.match(store, /cacheControlMaxAge: 60,/);
});

test("IMGW: asked only by the cron; its copy read only in live blocks", () => {
  assert.deepEqual(calling(/\bfetchFeed\(/), [
    "lib/imgw-cron.ts",
    "lib/imgw-mock.ts",
    "lib/imgw-warnings.ts",
  ]);
  assert.deepEqual(calling(/\bimgwCopy\(/), [
    "components/imgw-banner.tsx",
    "lib/live-store.ts",
    "lib/modules.ts",
  ]);
  // The banner, in its own hole, on every page but the address pages.
  assert.deepEqual(calling(/<ImgwLive \/>/), [
    "app/dostepnosc/page.tsx",
    "app/o-projekcie/page.tsx",
    "app/page.tsx",
    "app/prywatnosc/page.tsx",
    "app/ulice/page.tsx",
  ]);
});

test("the shells: every `use cache` scope is cacheLife max and tags the dataset", () => {
  const scopes = sources.flatMap((path) =>
    [
      ...readFileSync(new URL(path, root), "utf8").matchAll(
        /"use cache";\n\s+cacheLife\("(\w+)"\);\n\s+cacheTag\(([^)]*)\);/g,
      ),
    ].map((m) => `${path}: ${m[1]} ${m[2]}`),
  );
  assert.deepEqual(scopes, [
    "app/page.tsx: max DATASET",
    "app/sitemap.ts: dataset DATASET",
    "app/ulice/page.tsx: max DATASET",
    "components/place-page.tsx: max ...PLACE_TAGS",
    "components/place-page.tsx: max ...PLACE_TAGS",
    "components/water-page.tsx: max ...PLACE_TAGS",
  ]);
  // Every scope is one of those.
  assert.equal(calling(/"use cache"/).length, 5);
  assert.match(
    read("./schedule.ts"),
    /export const PLACE_TAGS = DAY_CACHE\.tags;/,
  );
  assert.match(read("./schedule.ts"), /const DAY_CACHE = CACHE;/);
});

test("the live blocks: read after io(), never inside a cached scope", () => {
  for (const [path, count] of [
    ["../components/hub.tsx", 1],
    ["../components/module-page.tsx", 1],
    ["../components/imgw-banner.tsx", 1],
  ] as const)
    assert.equal(
      read(path).match(/\n\s+await io\(\);\n/g)?.length,
      count,
      path,
    );
  for (const path of [
    "../components/hub.tsx",
    "../components/module-page.tsx",
    "../components/place-crumbs.tsx",
    "../components/imgw-banner.tsx",
  ])
    assert.doesNotMatch(read(path), /use cache/, path);
  const modules = read("./modules.ts");
  assert.equal(modules.match(/\n\s+live: true,\n/g)?.length, 2);
});

test("the address pages: one read per request, every block at once, shared with the breadcrumbs (task 239)", () => {
  // Every module's data in one Promise.all, after io(), behind React's
  // cache(), so the page and its breadcrumbs share one read.
  assert.match(
    read("../components/hub.tsx"),
    /export const hubData = cache\(async \(id: string, nr: string \| null\) => \{\n\s+await io\(\);\n\s+return \(await Promise\.all\(\n\s+MODULE_IDS\.map\(\(slug\) => MODULES\[slug\]\.load\(id, nr\)\),/,
  );
  assert.match(
    read("../components/module-page.tsx"),
    /export const subpageData = cache\(\n\s+async \(id: string, slug: string, nr: string \| null\) => \{\n\s+await io\(\);/,
  );
  const crumbs = read("../components/place-crumbs.tsx");
  assert.match(crumbs, /await hubData\(id, nr\)/);
  assert.match(crumbs, /await subpageData\(id, module, nr\)/);
  // One boundary per address route, the page's and its trail's.
  assert.deepEqual(calling(/<PlaceSuspense>/), [
    "app/adres/[id]/nr/[...nr]/page.tsx",
    "app/adres/[id]/numer/page.tsx",
    "app/adres/[id]/page.tsx",
    "components/subpage-route.tsx",
  ]);
  assert.deepEqual(calling(/<LiveBlock /), [
    "components/imgw-banner.tsx",
    "components/place-crumbs.tsx",
    "components/place-suspense.tsx",
  ]);
});
