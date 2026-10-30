import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { datasetHeaders } from "./gate.ts";
import { DATASET, DAY, IMGW, WATER } from "./headers.ts";

// Which responses carry which cache tag (lib/headers.ts): DATASET on every
// response built from the database, WATER beside it where water data is
// shown, DAY where the day-keyed waste data is read, IMGW where IMGW's
// warnings are shown, so the ZUK cron's purges reach them and nothing else.

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

test("datasetHeaders: DATASET, and an extra tag beside it", () => {
  assert.equal(DATASET, "dataset");
  assert.equal(WATER, "water");
  assert.equal(DAY, "day");
  assert.equal(IMGW, "imgw");
  assert.equal(datasetHeaders()["Vercel-Cache-Tag"], "dataset");
  assert.equal(
    datasetHeaders(undefined, WATER)["Vercel-Cache-Tag"],
    "dataset,water",
  );
  assert.equal(
    datasetHeaders("public, s-maxage=3600", WATER)["Cache-Control"],
    "public, s-maxage=3600",
  );
});

test("the water calendar is tagged WATER, the waste responses are not", () => {
  const water = read("../app/adres/[id]/woda.ics/route.ts");
  assert.match(
    water,
    /\.\.\.datasetHeaders\(undefined, WATER\),\n\s+\.\.\.NOINDEX,/,
  );
  assert.doesNotMatch(water, /\bDAY\b/);
  for (const path of [
    "../app/ics/[zoneId]/route.ts",
    "../app/adres/[id]/harmonogram.pdf/route.ts",
  ]) {
    const route = read(path);
    assert.doesNotMatch(route, /WATER/, path);
    // The file, built from the day-keyed data, is tagged DAY; its 308 and
    // 404 are not.
    assert.equal(
      route.match(/datasetHeaders\(undefined, DAY\),\n\s+\.\.\.NOINDEX,/g)
        ?.length,
      1,
      path,
    );
    assert.equal(route.match(/datasetHeaders\([^)]*,/g)?.length, 1, path);
  }
  for (const path of [
    "../app/api/search/route.ts",
    "../app/api/place-redirects/route.ts",
  ]) {
    const route = read(path);
    assert.doesNotMatch(route, /WATER/, path);
    assert.doesNotMatch(route, /datasetHeaders\([^)]*,/, path);
  }
});

test("the pages: the ZUK file's cache is tagged WATER, so is every page reading it", () => {
  // unstable_cache's tags are the rendering page's too (its ISR entry):
  // the hub and the /woda subpage, with or without a house number.
  assert.match(
    read("./zuk-store.ts"),
    /unstable_cache\(readZukFile, \["zuk-file"\], \{\n\s+tags: \[WATER\],/,
  );
  assert.match(read("./water-load.ts"), /getWaterData\(\)/);
  // Every source's file through that one cache, by its pathname.
  assert.match(read("./zuk-store.ts"), /await cached\(source\.pathname\)/);
});

test("the pages: the day-keyed caches are tagged DAY, so is every page reading them", () => {
  // getPlace and getZone: every address page, the PDF and the zone ICS.
  const schedule = read("./schedule.ts");
  assert.match(
    schedule,
    /const DAY_CACHE = \{ \.\.\.CACHE, tags: \[DATASET, DAY\] \};/,
  );
  for (const key of ["place", "zone"])
    assert.match(
      schedule,
      new RegExp(
        `const ${key}Cached = unstable_cache\\([^]*?\\["${key}-v\\d+"\\],\\n\\s+DAY_CACHE,\\n\\);`,
      ),
      key,
    );
  assert.equal(schedule.match(/DAY_CACHE,/g)?.length, 2);
  assert.doesNotMatch(schedule, /WATER/);
});

test("the ZUK cron's route purges by revalidateTag, never DATASET", () => {
  // What lib/zuk-cron.ts purges, and when, is behaviour: zuk-cron.test.ts
  // ("purge: …"). Only the route's wiring to Next is read here.
  const route = read("../app/api/cron/zuk/route.ts");
  assert.match(
    route,
    /const purge = \(tag: string\) => \{\n\s+revalidateTag\(tag, \{ expire: 0 \}\);\n\s+purged\.add\(tag\);/,
  );
  // Every run (each water source, IMGW) through it, and only its tags warmed.
  assert.equal(route.match(/\n\s+purge,\n/g)?.length, 2);
  assert.match(route, /warm\(purged, \{/);
  assert.match(route, /return sitePages\(places, noData\);/);
  assert.doesNotMatch(route, /import \{[^}]*\bDATASET\b/);
});

test("the pages: IMGW's feed cache is tagged IMGW, the only way a page reads the feed", () => {
  // One cache, tagged, for every copy and slot: imgwCopy reads it alone.
  const banner = read("../components/imgw-banner.tsx");
  assert.match(
    banner,
    /unstable_cache\(\(\) => load\(\), \["imgw-warnings", url, String\(slot\)\], \{\n\s+tags: \[IMGW\],/,
  );
  assert.equal(banner.match(/unstable_cache\(/g)?.length, 1);
  assert.match(banner, /return latest\(now, reader\(url\), load\);/);
  assert.match(banner, /shown = banner\(await imgwCopy\(now\), now\);/);
  // Every other source file: the feed only through imgwCopy (or the
  // cron's own fetch), so every page showing it carries the tag.
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
  const readers = sources.filter((path) =>
    /\b(fetchFeed|latest)\(/.test(readFileSync(new URL(path, root), "utf8")),
  );
  assert.deepEqual(readers, [
    "components/imgw-banner.tsx",
    "lib/imgw-cron.ts",
    "lib/imgw-warnings.ts",
  ]);
  // Where the warnings are shown: the banner on these pages, the weather
  // module (the address pages' „Pogoda” and „Najbliższe dni”).
  const drawing = sources.filter((path) =>
    readFileSync(new URL(path, root), "utf8").includes("<ImgwBanner />"),
  );
  assert.deepEqual(drawing, [
    "app/dostepnosc/page.tsx",
    "app/not-found.tsx",
    "app/o-projekcie/page.tsx",
    "app/page.tsx",
    "app/prywatnosc/page.tsx",
    "app/szukaj/page.tsx",
    "app/ulice/page.tsx",
  ]);
  assert.match(
    read("./modules.ts"),
    /return weather\(await imgwCopy\(now\), now\);/,
  );
});

test("the route map (lib/site-pages.ts): the sitemap reads it, its tags are the pages'", () => {
  // The sitemap and the cron's warming share it.
  assert.match(
    read("../app/sitemap.ts"),
    /return sitePages\(places, noData\)\.map/,
  );
  const map = read("./site-pages.ts");
  // The static pages draw the banner (above): IMGW alone.
  assert.match(map, /\.map\(\(path\) => \(\{\n\s+path,\n\s+tags: \[IMGW\],/);
  // The address page loads every module: waste (getPlace, DAY), water
  // (WATER) and the weather (imgwCopy, IMGW).
  assert.match(
    read("../components/hub.tsx"),
    /const modules = MODULE_IDS\.map/,
  );
  assert.match(map, /\{ path, tags: \[DAY, WATER, IMGW\] \}/);
  // The waste subpage: getPlace and the waste module alone (DAY).
  assert.match(
    read("../components/module-page.tsx"),
    /getPlace\(id, nr\),\n\s+module\?\.load\(id, nr\),/,
  );
  assert.match(map, /\{ path: `\$\{path\}\/\$\{WASTE\}`, tags: \[DAY\] \}/);
});
