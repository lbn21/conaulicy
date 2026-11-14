import assert from "node:assert/strict";
import { test } from "node:test";
import { fixtureDataset } from "./dataset-fixture.ts";
import { searchIndexOf } from "./dataset-views.ts";
import { todayInWarsaw } from "./dates.ts";
import { fileSlug, normalize } from "./normalize.ts";

// The search key and the file names (lib/normalize.ts), from the standard
// APIs: their output is the one the importer stored per place before, a
// table of the nine Polish letters, which NFD covers but for ł.
const TABLE: Record<string, string> = {
  ą: "a",
  ć: "c",
  ę: "e",
  ł: "l",
  ń: "n",
  ó: "o",
  ś: "s",
  ź: "z",
  ż: "z",
};
const tabled = (text: string) =>
  text
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (ch) => TABLE[ch])
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const POLISH = "aąbcćdeęfghijklłmnńoóprsśtuwyzźż";
const labels = () => [
  ...searchIndexOf(fixtureDataset(todayInWarsaw())).places.map(
    ([, label]) => label,
  ),
  POLISH,
  POLISH.toUpperCase(),
];

test("normalize: the same key as the per-letter table, every label and letter", () => {
  const all = labels();
  assert.ok(all.length > 2);
  for (const text of all) assert.equal(normalize(text), tabled(text), text);
  for (const ch of POLISH + POLISH.toUpperCase())
    assert.match(normalize(ch), /^[a-z]$/, ch);
});

test("fileSlug: words of a-z and 0-9, joined by single hyphens", () => {
  for (const text of labels())
    assert.match(fileSlug(text), /^[a-z0-9]+(-[a-z0-9]+)*$/, text);
});
