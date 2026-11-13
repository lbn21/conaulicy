import assert from "node:assert/strict";
import { test } from "node:test";
import { datasetHeaders } from "./gate.ts";
import { DATASET, LIVE } from "./headers.ts";
import { calling, SOURCES, source } from "./test-sources.ts";

// The caching model (next.config.ts, docs/perf.md): every page is
// prerendered whole. What comes from the dataset snapshot is cached for the
// longest time (cacheLife "max"), tagged DATASET, which only an import
// purges (app/api/revalidate). What the crons write (IMGW, PGE, water, the
// checks) and what counts from today is cached as "live", tagged LIVE,
// which the cron purges after each write (app/api/cron/zuk). Nothing is
// read per request but a request's own input (?nr=, ?imgw=).

test("datasetHeaders: the one tag, DATASET", () => {
  assert.equal(DATASET, "dataset");
  assert.equal(datasetHeaders()["Vercel-Cache-Tag"], "dataset");
  assert.equal(
    datasetHeaders("public, s-maxage=3600")["Cache-Control"],
    "public, s-maxage=3600",
  );
});

test("two purges: the import's, of DATASET; the cron's, of LIVE, after each write", () => {
  assert.equal(LIVE, "live");
  assert.deepEqual(calling(/\brevalidateTag\(/), [
    "app/api/cron/zuk/route.ts",
    "app/api/revalidate/route.ts",
  ]);
  assert.match(
    source("app/api/revalidate/route.ts"),
    /revalidateTag\(DATASET, \{ expire: 0 \}\);/,
  );
  const cron = source("app/api/cron/zuk/route.ts");
  // The purge only after the write has finished.
  assert.match(
    cron,
    /await write\(\.\.\.args\);\n\s+revalidateTag\(LIVE, \{ expire: 0 \}\);/,
  );
  // Every write of the cron's, and none of its reads, so purged.
  assert.equal(cron.match(/: written\(/g)?.length, 4);
  assert.doesNotMatch(cron, /(write\w*): \(body\) => write/);
  assert.doesNotMatch(source("lib/zuk-cron.ts"), /purge\(|revalidateTag/);
});

test("the crons' files: the pages' reads cached as live, from the Blob's origin", () => {
  const store = source("lib/live-store.ts");
  const zuk = source("lib/zuk-store.ts");
  // Every live feed's file and the status file, at once (liveRead).
  assert.match(store, /readBlobFile\(path\),/);
  assert.match(store, /readBlobFile\(CHECKS_PATH\),/);
  assert.match(store, /\n\s+FEED_PATH,\n/);
  assert.match(store, /\n\s+PGE_PATH,\n/);
  assert.match(zuk, /readBlobFile\(source\.pathname\);/);
  // The crons too: the origin, so a run compares with the last write.
  assert.match(zuk, /return readBlobFile\(pathname\);/);
  assert.match(
    source("app/api/cron/zuk/route.ts"),
    /readFeed: \(\) => readBlobFile\(FEED_PATH\),/,
  );
  // The CDN only for the dataset's immutable versions.
  assert.deepEqual(calling(/cdn: true/), ["lib/dataset.ts"]);
});

test("IMGW: asked only by the cron; its copy read only on the address pages", () => {
  assert.deepEqual(calling(/\bfetchFeed\(/), [
    "lib/imgw-cron.ts",
    "lib/imgw-mock.ts",
    "lib/imgw-warnings.ts",
  ]);
  // The weather module, loaded by the address pages (hubData), and the
  // home page's „Teraz w gminie” (t390), each behind its live block.
  assert.deepEqual(calling(/\bimgwCopy\(/), [
    "components/now-tiles.ts",
    "lib/live-store.ts",
    "lib/modules.ts",
  ]);
  // No IMGW banner on any other page.
  assert.deepEqual(calling(/\bimgw-banner\b|<ImgwLive/), []);
});

test("PGE: asked only by the cron; its copy read only by the power module", () => {
  assert.deepEqual(calling(/\bfetchOutages\(/), [
    "lib/pge-cron.ts",
    "lib/pge-feed.ts",
    "lib/pge-mock.ts",
  ]);
  // The power module's loader, for the address page and /prad, and the
  // home page's „Teraz w gminie” (t390).
  assert.deepEqual(calling(/\bpgeCopy\(/), [
    "components/now-tiles.ts",
    "lib/live-store.ts",
    "lib/power-load.ts",
  ]);
});

test("every `use cache` scope: max under DATASET, or live under LIVE", () => {
  const scopes = SOURCES.flatMap((path) =>
    [
      ...source(path).matchAll(
        /"use cache";\n\s+cacheLife\("(\w+)"\);\n\s+cacheTag\(([^)]*)\);/g,
      ),
    ].map((m) => `${path}: ${m[1]} ${m[2]}`),
  );
  assert.deepEqual(scopes, [
    "app/page.tsx: max DATASET",
    "app/page.tsx: max DATASET",
    "app/sitemap.ts: dataset DATASET",
    "app/ulice/page.tsx: max DATASET",
    "components/hub.tsx: live LIVE, ...PLACE_TAGS",
    "components/module-page.tsx: live LIVE, ...PLACE_TAGS",
    "components/now-panel.tsx: live LIVE",
    "components/place-page.tsx: max ...PLACE_TAGS",
    "components/place-page.tsx: max ...PLACE_TAGS",
    "components/place-page.tsx: max ...PLACE_TAGS",
    "components/subpage-route.tsx: max ...PLACE_TAGS",
    "lib/dataset.ts: max DATASET",
    "lib/live-store.ts: live LIVE",
    "lib/live-store.ts: live LIVE",
    "lib/schedule.ts: live LIVE",
    "lib/zuk-store.ts: live LIVE",
  ]);
  // Every scope is one of those.
  assert.equal(calling(/"use cache"/).length, 12);
  // The places' data is the dataset snapshot, under the dataset tag only.
  assert.match(
    source("lib/schedule.ts"),
    /export const PLACE_TAGS = \[DATASET\];/,
  );
});

test("nothing read per request but the request's own input: no io(), no connection() in a page", () => {
  for (const path of SOURCES.filter((p) => !p.startsWith("app/api/")))
    assert.doesNotMatch(source(path), /\bawait (io|connection)\(\)/, path);
});

test("the address pages: every block at once; ?nr= only on its own routes", () => {
  // Every module's data in one Promise.all, in one live scope.
  assert.match(
    source("components/hub.tsx"),
    /cacheTag\(LIVE, \.\.\.PLACE_TAGS\);\n\s+const data = \(await Promise\.all\(\n\s+MODULE_IDS\.map\(\(slug\) => MODULES\[slug\]\.load\(id, nr, imgw\)\),/,
  );
  // ?nr= read after navigation(), so the shell and prefetch stay static.
  assert.match(
    source("components/place-page.tsx"),
    /await navigation\(\);\n\s+return houseQuery\(\(await searchParams\)\.nr\);/,
  );
  // The routes of the place alone never read the query.
  for (const path of [
    "app/adres/[id]/page.tsx",
    "app/adres/[id]/smieci/page.tsx",
    "app/adres/[id]/woda/page.tsx",
    "app/adres/[id]/prad/page.tsx",
  ])
    assert.match(source(path), /Route\("?\w*"?\)|hubRoute\(false\)/, path);
  for (const path of [
    "app/adres/[id]/nr/page.tsx",
    "app/adres/[id]/nr/smieci/page.tsx",
    "app/adres/[id]/nr/woda/page.tsx",
    "app/adres/[id]/nr/prad/page.tsx",
  ])
    assert.match(source(path), /hubRoute\(true\)|\{ query: true \}/, path);
  // One boundary per address route, its breadcrumbs inside (t400); the
  // home page's panel none: it is in the page's HTML.
  assert.deepEqual(calling(/<PlaceSuspense[ >]/), [
    "components/hub-route.tsx",
    "components/subpage-route.tsx",
  ]);
  assert.deepEqual(calling(/<LiveBlock /), ["components/place-suspense.tsx"]);
});
