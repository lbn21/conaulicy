import assert from "node:assert/strict";
import { test } from "node:test";
import { matcher, type SearchIndex, searchTerms } from "./search.ts";

const INDEX: SearchIndex = [
  ["s1", "ul. Adama Asnyka, Lubaczów"],
  ["s2", "ul. Juliusza Słowackiego, Lubaczów"],
  ["v1", "Dąbrowa (Basznia Górna, gm. Lubaczów)"],
  ["v2", "Dąbrowa (gm. Lubaczów)"],
];

test("ul. and ulica alone leave nothing to search for", () => {
  for (const q of ["ul", "ul.", " Ulica ", "ul. ulica"]) {
    assert.deepEqual(searchTerms(q), []);
  }
  assert.deepEqual(searchTerms("ul. Słowackiego"), ["slowackiego"]);
});

test("matches every word, any case, with or without Polish letters", () => {
  const match = matcher(INDEX);
  const ids = (q: string) => match(searchTerms(q)).map((hit) => hit.id);
  assert.deepEqual(ids("ASNYKA"), ["s1"]);
  assert.deepEqual(ids("ulica słowa"), ["s2"]);
  assert.deepEqual(ids("dabrowa basz"), ["v1"]);
  assert.deepEqual(ids("dąbrowa"), ["v1", "v2"]);
  assert.deepEqual(ids("ul"), []);
  assert.deepEqual(ids("qqqq"), []);
});

test("at most 8 places, in Polish alphabetical order", () => {
  const many: SearchIndex = Array.from({ length: 12 }, (_, i) => [
    `x${i}`,
    `Łąka ${String(12 - i).padStart(2, "0")}`,
  ]);
  many.push(["z", "Lasek"]);
  const hits = matcher(many)(["la"]);
  assert.equal(hits.length, 8);
  assert.equal(hits[0].label, "Lasek");
  assert.equal(hits[1].label, "Łąka 01");
});
