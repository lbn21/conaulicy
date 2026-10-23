import assert from "node:assert/strict";
import { test } from "node:test";
import { withHouseNumber } from "./house.ts";
import {
  exactPlace,
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

// Real labels, among them ones whose words all appear in another label, so
// the search proper finds several places for them.
const PLACES: SearchIndex = [
  ["0605909", "Basznia (Basznia Dolna, gm. Lubaczów)"],
  ["0605950", "Basznia Górna (gm. Lubaczów)"],
  ["0605890", "Basznia Dolna (gm. Lubaczów)"],
  ["0605921", "Lubasy (Basznia Dolna, gm. Lubaczów)"],
  ["0605967", "Dąbrowa (Basznia Górna, gm. Lubaczów)"],
  ["0606010", "Dąbrowa (gm. Lubaczów)"],
  ["0605890-20431", "ul. Jana III Sobieskiego, Basznia Dolna"],
  ["0605890-10898", "ul. Leśna, Basznia Dolna"],
  ["0972447-00470", "ul. Adama Asnyka, Lubaczów"],
  ["0972447-19253", "ul. Rynek, Lubaczów"],
  ["0972447-90010", "ul. 3 Maja, Lubaczów"],
];

test("every suggestion's text opens its own place", () => {
  for (const [id, label] of PLACES) {
    assert.deepEqual(exactPlace(PLACES, label), { id, label }, label);
    for (const nr of ["12", "7a", "7/22"]) {
      const text = withHouseNumber(label, nr);
      assert.deepEqual(exactPlace(PLACES, text), { id, label, nr }, text);
    }
  }
  assert.ok(findPlaces(matcher(PLACES, Infinity), PLACES[0][1]).length > 1);
});

test("the text as search compares it: case, Polish letters, spaces", () => {
  assert.deepEqual(
    exactPlace(PLACES, "  BASZNIA  (basznia dolna gm lubaczow"),
    {
      id: "0605909",
      label: "Basznia (Basznia Dolna, gm. Lubaczów)",
    },
  );
  assert.deepEqual(exactPlace(PLACES, "ul. Adama Asnyka 12A, Lubaczów"), {
    id: "0972447-00470",
    label: "ul. Adama Asnyka, Lubaczów",
    nr: "12a",
  });
});

test("anything else is left to the search proper", () => {
  for (const q of [
    "Basznia",
    "Asnyka",
    "Asnyka 12",
    "ul. Adama Asnyka, Lubaczów, 12",
    "12 ul. Adama Asnyka, Lubaczów",
    "ul. Adama Asnyka 12 14, Lubaczów",
  ]) {
    assert.equal(exactPlace(PLACES, q), null, q);
  }
  const twice: SearchIndex = [
    ["a", "Wola (gm. Lubaczów)"],
    ["b", "Wola (gm. Lubaczów)"],
  ];
  assert.equal(exactPlace(twice, "Wola (gm. Lubaczów)"), null);
});
