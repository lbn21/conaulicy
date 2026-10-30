import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { datasetHeaders } from "./gate.ts";
import { DATASET, DAY, WATER } from "./headers.ts";

// Which responses carry which cache tag (lib/headers.ts): DATASET on every
// response built from the database, WATER beside it where water data is
// shown, DAY where the day-keyed waste data is read, so the ZUK cron's
// purges reach them and nothing else.

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

test("datasetHeaders: DATASET, and an extra tag beside it", () => {
  assert.equal(DATASET, "dataset");
  assert.equal(WATER, "water");
  assert.equal(DAY, "day");
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
    /purge: \(tag\) => revalidateTag\(tag, \{ expire: 0 \}\),/,
  );
  assert.doesNotMatch(route, /import \{[^}]*\bDATASET\b/);
});
