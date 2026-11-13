import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { test } from "node:test";
import {
  FILE_NAMES,
  isModuleId,
  MODULE_IDS,
  SUBPAGE_IDS,
} from "./address-routes.ts";

// The exact list: unique, plain path segments, in the pages' order.
test("waste first, then water, power, then weather; all but the weather have a subpage", () => {
  assert.deepEqual(MODULE_IDS, ["smieci", "woda", "prad", "pogoda"]);
  // The weather's warnings are cards on the address page.
  assert.deepEqual(SUBPAGE_IDS, ["smieci", "woda", "prad"]);
  for (const id of SUBPAGE_IDS) assert.ok(isModuleId(id), id);
  // Each subpage its own route folder (no [module]).
  const root = new URL("../app/adres/[id]/", import.meta.url);
  const folders = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !FILE_NAMES.includes(d.name))
    .map((d) => d.name)
    .sort();
  assert.deepEqual(folders, [...SUBPAGE_IDS].sort());
});

test("no module is called like another folder", () => {
  for (const id of MODULE_IDS) assert.ok(!FILE_NAMES.includes(id), id);
  assert.equal(isModuleId("harmonogram.pdf"), false);
  assert.equal(isModuleId("pogoda"), true);
  assert.equal(isModuleId("prad"), true);
  assert.equal(isModuleId("gaz"), false);
});

test("every file route under app/adres/[id]/ is a FILE_NAMES entry", () => {
  const folders = readdirSync(new URL("../app/adres/[id]/", import.meta.url), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory() && entry.name.includes("."))
    .map((entry) => entry.name);
  assert.deepEqual(folders.toSorted(), [...FILE_NAMES].toSorted());
});
