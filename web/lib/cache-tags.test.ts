import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { datasetHeaders } from "./gate.ts";
import { DATASET, WATER } from "./headers.ts";

// Which responses carry which cache tag (lib/headers.ts): DATASET on every
// response built from the database, WATER beside it where water data is
// shown, so the ZUK cron's purge reaches them and nothing else.

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

test("datasetHeaders: DATASET, and an extra tag beside it", () => {
  assert.equal(DATASET, "dataset");
  assert.equal(WATER, "water");
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
  for (const path of [
    "../app/ics/[zoneId]/route.ts",
    "../app/adres/[id]/harmonogram.pdf/route.ts",
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

test("the ZUK cron purges WATER, never DATASET", () => {
  const route = read("../app/api/cron/zuk/route.ts");
  assert.match(
    route,
    /purge: \(tag\) => revalidateTag\(tag, \{ expire: 0 \}\),/,
  );
  assert.doesNotMatch(route, /import \{[^}]*\bDATASET\b/);
  const cron = read("./zuk-cron.ts");
  assert.doesNotMatch(cron, /import \{[^}]*\bDATASET\b/);
  assert.match(cron, /if \(changed\) deps\.purge\(WATER\);/);
});
