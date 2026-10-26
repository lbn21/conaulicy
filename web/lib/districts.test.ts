import assert from "node:assert/strict";
import { test } from "node:test";
import { checkDistricts, unknownStreets } from "./districts.ts";
import { DISTRICTS } from "./districts-seed.ts";
import { ZUK_PLACES } from "./zuk-places.generated.ts";

const [first, second] = DISTRICTS.filter((d) => d.streets.length > 0);

test("checkDistricts: the seed's street ids are all TERYT's, of their town", () => {
  checkDistricts(DISTRICTS, ZUK_PLACES.streets);
  assert.deepEqual(unknownStreets(DISTRICTS, ZUK_PLACES.streets), []);
});

test("checkDistricts: throws on a street id TERYT lacks", () => {
  const unknown = `${first.localityId}-99999`;
  assert.throws(
    () =>
      checkDistricts(
        [{ ...first, streets: [{ ...first.streets[0], id: unknown }] }],
        ZUK_PLACES.streets,
      ),
    new RegExp(`not a street of its town: ${first.id}: ${unknown}`),
  );
});

test("checkDistricts: throws on a street of another town", () => {
  assert.throws(
    () =>
      checkDistricts([{ ...first, localityId: "0000000" }], ZUK_PLACES.streets),
    /not a street of its town/,
  );
});

test("checkDistricts: throws on a district id given twice", () => {
  assert.throws(
    () =>
      checkDistricts([first, { ...second, id: first.id }], ZUK_PLACES.streets),
    new RegExp(`district twice: ${first.id}`),
  );
});

const TOWN = "0972447";
const id = (ulic: string) => `${TOWN}-${ulic}`;
const MAZURY_DISTRICT = DISTRICTS.find((d) => d.id === "mazury");
assert.ok(MAZURY_DISTRICT);
const ESTATE = MAZURY_DISTRICT.streets.map((s) => s.id);

test("seed: every street id is TERYT's, of the town; Mazury exactly the 22 approved", () => {
  checkDistricts(DISTRICTS, ZUK_PLACES.streets);
  assert.throws(
    () =>
      checkDistricts(
        [
          {
            ...MAZURY_DISTRICT,
            streets: [{ ...MAZURY_DISTRICT.streets[0], id: id("99999") }],
          },
        ],
        ZUK_PLACES.streets,
      ),
    /not a street of its town: mazury: 0972447-99999/,
  );
  assert.deepEqual(
    MAZURY_DISTRICT.streets.map((s) => s.id.slice(8)),
    [
      "38139",
      "29695",
      "08179",
      "22684",
      "38140",
      "15092",
      "38137",
      "38138",
      "48939",
      "44269",
      "48377",
      "24870",
      "17390",
      "38687",
      "48412",
      "38689",
      "38690",
      "24170",
      "07290",
      "08574",
      "00157",
      "02276",
    ],
  );
  assert.equal(
    MAZURY_DISTRICT.streets.filter((s) => s.confidence === "high").length,
    8,
  );
  // Not in the estate: ul. Mazury, Boczna Mazury, Podleśna, Łąkowa,
  // Ustronna, and the low ones (Jaworowa, Ostrowiecka).
  for (const ulic of [
    "12559",
    "01533",
    "16799",
    "11596",
    "23434",
    "07394",
    "15388",
  ])
    assert.equal(ESTATE.includes(id(ulic)), false, ulic);
  // Villages are never a town district; low streets never seeded.
  const names = DISTRICTS.map((d) => d.name).join(" ");
  assert.doesNotMatch(names, /Załuże|Bałaje/);
  const all = DISTRICTS.flatMap((d) => d.streets.map((s) => s.id));
  for (const ulic of ["15710", "13252", "25084", "16894", "48934", "17011"])
    assert.equal(all.includes(id(ulic)), false, ulic);
  assert.ok(DISTRICTS.every((d) => d.localityId === TOWN));
});

test("seed: the addendum's districts, their streets and stretches", () => {
  const streets = (key: string) =>
    DISTRICTS.find((d) => d.id === key)?.streets.map((s) =>
      s.part ? `${s.id.slice(8)} ${s.part}` : s.id.slice(8),
    );
  assert.deepEqual(streets("mazury-vi"), ["38687", "48412"]);
  assert.deepEqual(
    DISTRICTS.find((d) => d.id === "mazury-vi")?.streets.map(
      (s) => s.sourceUrl,
    ),
    [
      "https://um.lubaczow.pl/aktualnosci/drogi-miejskie-do-przebudowy.html",
      "https://um.lubaczow.pl/aktualnosci/drogi-miejskie-do-przebudowy.html",
    ],
  );
  assert.deepEqual(
    unknownStreets(
      [
        {
          ...MAZURY_DISTRICT,
          streets: [{ ...MAZURY_DISTRICT.streets[0], id: id("99999") }],
        },
      ],
      ZUK_PLACES.streets,
    ),
    [{ district: "mazury", street: "0972447-99999" }],
  );
  assert.deepEqual(unknownStreets(DISTRICTS, ZUK_PLACES.streets), []);
  assert.deepEqual(streets("piaski"), [
    "16027",
    "16033",
    "18819",
    "24550",
    "26081",
    "14834",
  ]);
  assert.deepEqual(streets("maly-lazek"), ["12206"]);
  assert.deepEqual(streets("jagiellonow"), ["45843"]);
  assert.deepEqual(streets("mickiewicza"), ["48372"]);
  assert.deepEqual(streets("unii-lubelskiej"), ["48373", "23367"]);
  assert.deepEqual(streets("orzeszkowej"), ["15211"]);
  assert.deepEqual(streets("norwida"), ["14319"]);
  assert.deepEqual(streets("slowackiego"), ["20291 bloki 24–34A"]);
  assert.deepEqual(streets("zelichowka"), ["26445"]);
  assert.deepEqual(streets("pod-borem"), ["16590"]);
  assert.deepEqual(streets("zuki"), ["26555"]);
  assert.deepEqual(streets("folwarki"), ["20254"]);
  assert.deepEqual(streets("za-niemirowska"), [
    "10562",
    "09223",
    "26077",
    "23129",
    "19000",
    "05027",
    "07059",
    "12991",
    "13998",
  ]);
  for (const key of [
    "niwki",
    "ostrowiec",
    "zaprzekop",
    "jana-pawla-ii",
    "przy-przemyslowej",
    "za-koleja",
  ])
    assert.deepEqual(streets(key), [], key);
});
