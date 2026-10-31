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
    "components/hub.tsx: max ...PLACE_TAGS",
    "components/module-page.tsx: max ...PLACE_TAGS",
    "components/place-crumbs.tsx: max ...PLACE_TAGS",
    "components/place-page.tsx: max ...PLACE_TAGS",
    "components/water-page.tsx: max ...PLACE_TAGS",
  ]);
  // Every scope is one of those.
  assert.equal(calling(/"use cache"/).length, 8);
  assert.match(
    read("./schedule.ts"),
    /export const PLACE_TAGS = DAY_CACHE\.tags;/,
  );
  assert.match(read("./schedule.ts"), /const DAY_CACHE = CACHE;/);
});

test("the live blocks: read after io(), never inside a cached scope", () => {
  for (const [path, count] of [
    ["../components/hub.tsx", 2],
    ["../components/module-page.tsx", 1],
    ["../components/imgw-banner.tsx", 1],
  ] as const)
    assert.equal(
      read(path).match(/\n\s+await io\(\);\n/g)?.length,
      count,
      path,
    );
  assert.doesNotMatch(read("../components/imgw-banner.tsx"), /use cache/);
  // Every live module's body and „Najbliższe dni” through LiveBlock.
  const hub = read("../components/hub.tsx");
  assert.match(
    hub,
    /<LiveBlock skeleton=\{UPCOMING_SKELETON\}>\n\s+<UpcomingLive /,
  );
  assert.match(
    hub,
    /<LiveBlock key=\{slug\} skeleton=\{sectionSkeleton\(MODULES\[slug\]\)\}>\n\s+<ModuleLive /,
  );
  const modules = read("./modules.ts");
  assert.equal(modules.match(/\n\s+live: true,\n/g)?.length, 2);
});
