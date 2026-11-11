import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { test } from "node:test";
import { addressPrefetch } from "./address-prefetch.ts";
import {
  ADDRESS,
  FILE_NAMES,
  isModuleId,
  MODULE_IDS,
  MODULE_ROUTE_IDS,
  SUBPAGE_IDS,
} from "./address-routes.ts";
import { placePath } from "./places.ts";

// The exact list: unique, plain path segments, in the pages' order.
test("waste first, then water, then weather; all but the weather have a subpage", () => {
  assert.deepEqual(MODULE_IDS, ["smieci", "woda", "pogoda"]);
  // The weather's warnings are cards on the address page.
  assert.deepEqual(SUBPAGE_IDS, ["smieci", "woda"]);
  for (const id of SUBPAGE_IDS) assert.ok(isModuleId(id), id);
  // Waste has its own folder; the others are app/adres/[id]/[module]/.
  assert.deepEqual(MODULE_ROUTE_IDS, ["woda"]);
});

test("no module is called like another folder", () => {
  for (const id of MODULE_IDS) assert.ok(!FILE_NAMES.includes(id), id);
  assert.equal(isModuleId("harmonogram.pdf"), false);
  assert.equal(isModuleId("pogoda"), true);
  assert.equal(isModuleId("prad"), false);
});

test("the street page and a module subpage take ?nr=", () => {
  assert.ok(ADDRESS.test("/adres/0972447-00470"));
  assert.ok(ADDRESS.test("/adres/0972447-00470/"));
  assert.ok(ADDRESS.test("/adres/0972447-00470/smieci"));
  assert.ok(ADDRESS.test("/adres/0972447-00470/smieci/"));
  assert.ok(ADDRESS.test("/adres/0972447-00470/woda"));
  // No subpage: a 404, no ?nr=.
  assert.ok(!ADDRESS.test("/adres/0972447-00470/pogoda"));
  // No such module: no ?nr= (its URL is a 404).
  assert.ok(!ADDRESS.test("/adres/0972447-00470/prad"));
  assert.ok(!ADDRESS.test("/adres/0972447-00470/numer"));
  assert.ok(!ADDRESS.test("/adres/0972447-00470/harmonogram.pdf"));
  assert.ok(!ADDRESS.test("/adres/0972447-00470/woda.ics"));
  assert.ok(!ADDRESS.test("/adres"));
});

test("every file route under app/adres/[id]/ is a FILE_NAMES entry", () => {
  const folders = readdirSync(new URL("../app/adres/[id]/", import.meta.url), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory() && entry.name.includes("."))
    .map((entry) => entry.name);
  assert.deepEqual(folders.toSorted(), [...FILE_NAMES].toSorted());
});

test("full prefetch only for a canonical address page, never a redirect source", () => {
  for (const id of ["0987654", "ul-mickiewicza", "zażółć gęślą"]) {
    assert.equal(addressPrefetch(placePath(id)), true, id);
    for (const module of SUBPAGE_IDS)
      assert.equal(addressPrefetch(`${placePath(id)}/${module}`), true);
  }
  const others = [
    // ?nr= reads searchParams (a prefetch rendered per request), a
    // trailing slash is redirected
    placePath("x", "12a"),
    "/adres/x/smieci?nr=5",
    "/adres/x?utm=1",
    "/adres/x/",
    "/adres/x/harmonogram.pdf",
    "/adres/x/woda.ics",
    "/adres/x#nr",
    "/",
    "/ulice#wsie-heading",
  ];
  for (const path of others) assert.equal(addressPrefetch(path), "auto", path);
});
