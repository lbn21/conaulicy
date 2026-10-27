import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ADDRESS,
  ADDRESS_VARIANTS,
  isModuleId,
  MODULE_IDS,
  NUMBER_REWRITES,
  numberErrorPath,
  RESERVED_SEGMENTS,
  SUBPAGE_IDS,
} from "./address-routes.ts";

test("waste first, then water, then weather; the weather has no subpage", () => {
  assert.deepEqual(MODULE_IDS, ["smieci", "woda", "pogoda"]);
  assert.equal(MODULE_IDS[0], "smieci");
  assert.deepEqual(SUBPAGE_IDS, ["smieci", "woda"]);
  for (const id of SUBPAGE_IDS) assert.ok(isModuleId(id), id);
});

test("module ids are unique", () => {
  assert.equal(new Set(MODULE_IDS).size, MODULE_IDS.length);
});

test("no module is called nr, numer or like another folder", () => {
  for (const id of MODULE_IDS) {
    assert.ok(!["nr", "numer"].includes(id), id);
    assert.ok(!RESERVED_SEGMENTS.includes(id), id);
  }
  assert.equal(isModuleId("nr"), false);
  assert.equal(isModuleId("numer"), false);
  assert.equal(isModuleId("harmonogram.pdf"), false);
  assert.equal(isModuleId("smieci"), true);
  assert.equal(isModuleId("pogoda"), true);
  assert.equal(isModuleId("woda"), true);
  assert.equal(isModuleId("prad"), false);
});

test("module ids are plain path segments", () => {
  for (const id of MODULE_IDS) assert.match(id, /^[a-z]+$/);
});

test("the street page and a module subpage take ?nr=", () => {
  assert.ok(ADDRESS.test("/adres/0972447-00470"));
  assert.ok(ADDRESS.test("/adres/0972447-00470/"));
  assert.ok(ADDRESS.test("/adres/0972447-00470/smieci"));
  assert.ok(ADDRESS.test("/adres/0972447-00470/smieci/"));
  assert.ok(ADDRESS.test("/adres/0972447-00470/woda"));
  assert.ok(!ADDRESS.test("/adres/0972447-00470/prad"));
  // A module without a subpage takes no ?nr= (its URL is a 404).
  assert.ok(!ADDRESS.test("/adres/0972447-00470/pogoda"));
  assert.ok(!ADDRESS.test("/adres/0972447-00470/numer"));
  assert.ok(!ADDRESS.test("/adres/0972447-00470/harmonogram.pdf"));
  assert.ok(!ADDRESS.test("/adres/0972447-00470/woda.ics"));
  assert.ok(!ADDRESS.test("/adres"));
});

test("their number and error variants", () => {
  const variant = (path: string) =>
    ADDRESS_VARIANTS.some((re) => re.test(path));
  assert.ok(variant("/adres/X/nr/12"));
  assert.ok(variant("/adres/X/nr/7/22"));
  assert.ok(variant("/adres/X/numer"));
  assert.ok(variant("/adres/X/smieci/nr/12a"));
  assert.ok(variant("/adres/X/smieci/nr/7/22"));
  assert.ok(variant("/adres/X/smieci/numer"));
  assert.ok(!variant("/adres/X/nr"));
  assert.ok(variant("/adres/X/woda/nr/12"));
  assert.ok(variant("/adres/X/woda/numer"));
  assert.ok(!variant("/adres/X/prad/nr/12"));
  assert.ok(!variant("/adres/X/pogoda/nr/12"));
  assert.ok(!variant("/adres/X/pogoda/numer"));
  assert.ok(!variant("/adres/X/smieci"));
});

test("a valid ?nr= becomes a path, for the street page and a module; any other, the error variant", () => {
  assert.deepEqual(
    NUMBER_REWRITES.map(({ source, destination }) => [source, destination]),
    [
      ["/adres/:id", "/adres/:id/nr/:nr"],
      ["/adres/:id/:module(smieci|woda)", "/adres/:id/:module/nr/:nr"],
    ],
  );
  for (const rule of NUMBER_REWRITES) {
    assert.equal(rule.has.length, 1);
    const [has] = rule.has;
    assert.equal(has.type, "query");
    assert.equal(has.key, "nr");
    const value = new RegExp(`^${has.value}$`);
    for (const nr of ["12", "12a", "12A", "7/22", "12/14b"]) {
      assert.ok(value.test(nr), nr);
    }
    for (const nr of ["", "abc", "12 a", "12345", "1/2/3"]) {
      assert.ok(!value.test(nr), nr);
    }
  }
  // Any other ?nr= goes to the page's own error variant.
  assert.equal(numberErrorPath("/adres/X"), "/adres/X/numer");
  assert.equal(numberErrorPath("/adres/X/"), "/adres/X/numer");
  assert.equal(numberErrorPath("/adres/X/smieci"), "/adres/X/smieci/numer");
  assert.equal(numberErrorPath("/adres/X/smieci/"), "/adres/X/smieci/numer");
  assert.equal(numberErrorPath("/adres/X/woda"), "/adres/X/woda/numer");
  assert.equal(numberErrorPath("/adres/X/prad"), null);
  assert.equal(numberErrorPath("/adres/X/numer"), null);
  assert.equal(numberErrorPath("/adres/X/nr/12"), null);
  assert.equal(numberErrorPath("/ulice"), null);
});
