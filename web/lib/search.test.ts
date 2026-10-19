import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findPlaces,
  matcher,
  placeHref,
  type SearchIndex,
  searchTerms,
} from "./search.ts";

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

test("a house number rides along with the place", () => {
  const match = matcher(INDEX);
  assert.deepEqual(findPlaces(match, "Asnyka 12"), [
    { id: "s1", label: "ul. Adama Asnyka, Lubaczów", nr: "12" },
  ]);
  assert.deepEqual(
    findPlaces(match, "12A asnyka").map((hit) => hit.nr),
    ["12a"],
  );
  assert.deepEqual(
    findPlaces(match, "ul. Słowackiego 7/22").map((hit) => hit.nr),
    ["7/22"],
  );
  assert.deepEqual(findPlaces(match, "Asnyka"), [
    { id: "s1", label: "ul. Adama Asnyka, Lubaczów" },
  ]);
  assert.deepEqual(findPlaces(match, "ul 12"), []);
  assert.equal(
    placeHref({ id: "s1", label: "", nr: "7/22" }),
    "/adres/s1?nr=7/22",
  );
  assert.equal(placeHref({ id: "s1", label: "" }), "/adres/s1");
});
