import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { test } from "node:test";
import { addressPrefetch } from "./address-prefetch.ts";
import {
  ADDRESS,
  FILE_NAMES,
  isModuleId,
  MODULE_IDS,
  SUBPAGE_IDS,
  unknownAddress,
} from "./address-routes.ts";
import { placePath } from "./places.ts";

// The exact list: unique, plain path segments, in the pages' order.
test("waste first, then water, power, then weather; all but the weather have a subpage", () => {
  assert.deepEqual(MODULE_IDS, ["smieci", "woda", "prad", "pogoda"]);
  // The weather's warnings are cards on the address page.
  assert.deepEqual(SUBPAGE_IDS, ["smieci", "woda", "prad"]);
  for (const id of SUBPAGE_IDS) assert.ok(isModuleId(id), id);
  // Each subpage its own route folder and its breadcrumbs' (no [module]:
  // a shared App Shell cannot know its module, components/subpage-route.tsx).
  const app = new URL("../app/", import.meta.url);
  for (const root of ["adres/[id]/", "@breadcrumbs/adres/[id]/"]) {
    const folders = readdirSync(new URL(root, app), { withFileTypes: true })
      .filter((d) => d.isDirectory() && !FILE_NAMES.includes(d.name))
      .map((d) => d.name)
      .sort();
    assert.deepEqual(folders, [...SUBPAGE_IDS].sort(), root);
  }
});

test("no module is called like another folder", () => {
  for (const id of MODULE_IDS) assert.ok(!FILE_NAMES.includes(id), id);
  assert.equal(isModuleId("harmonogram.pdf"), false);
  assert.equal(isModuleId("pogoda"), true);
  assert.equal(isModuleId("prad"), true);
  assert.equal(isModuleId("gaz"), false);
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
  assert.ok(ADDRESS.test("/adres/0972447-00470/prad"));
  assert.ok(!ADDRESS.test("/adres/0972447-00470/gaz"));
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

test("an unknown address is the proxy's 404, before any render", () => {
  const places = new Set(["0972447-00470", "0606004", "0972447-99999"]);
  const street = "/adres/0972447-00470";
  // Known: the page, its subpages and files.
  for (const path of [
    street,
    `${street}/`,
    `${street}/smieci`,
    `${street}/woda/`,
    `${street}/prad`,
    `${street}/harmonogram.pdf`,
    `${street}/woda.ics`,
    "/adres/0606004/smieci",
    // A renamed place's old id: the proxy's 308, not a 404.
    "/adres/0972447-99999/smieci",
  ])
    assert.equal(unknownAddress(path, places), false, path);
  // Anything else after an id, or an unknown id, whatever comes after.
  for (const path of [
    `${street}/pogoda`,
    `${street}/gaz`,
    // No power calendar (only water's woda.ics).
    `${street}/prad.ics`,
    `${street}/numer`,
    "/adres/0606004/pogoda",
    "/adres/0972447-88888",
    "/adres/0972447-88888/smieci",
    "/adres/0972447-88888/harmonogram.pdf",
    "/adres/nie-ma",
    "/adres/%E0%A4%A",
  ])
    assert.equal(unknownAddress(path, places), true, path);
  // Places not loaded: only the path itself decides.
  assert.equal(unknownAddress(`${street}/pogoda`, null), true);
  assert.equal(unknownAddress("/adres/0972447-88888", null), false);
  // Not an address (deeper paths match no route: Next.js's own 404).
  for (const path of ["/", "/adres", "/ulice", `${street}/nr/12`])
    assert.equal(unknownAddress(path, places), false, path);
});
