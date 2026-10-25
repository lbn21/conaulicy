import assert from "node:assert/strict";
import { test } from "node:test";
import {
  changesTable,
  oursFromTeryt,
  parseSimc,
  parseUlic,
  placeRows,
  terytDiff,
} from "./teryt.ts";
import { SIMC, TERCS, ULIC } from "./teryt-fixture.ts";

const ulic = parseUlic(ULIC);
const simc = parseSimc(SIMC);
const inScope = <T extends { terc: string }>(rows: T[]) =>
  rows.filter((r) => TERCS.includes(r.terc));

test("TERYT files: BOM, semicolons, CRLF; NAZWA_2 empty, SYMPOD to itself", () => {
  assert.equal(ulic.length, 6);
  assert.deepEqual(ulic[0], {
    terc: "1809011",
    simc: "0972447",
    symUl: "00470",
    cecha: "ul.",
    nazwa1: "Asnyka",
    nazwa2: "Adama",
  });
  assert.equal(ulic[3].nazwa2, null);
  assert.equal(simc[1].parent, null);
  assert.equal(simc[2].parent, "0605890");
});

test("our places built from the same TERYT: no changes", () => {
  const ours = oursFromTeryt(inScope(ulic), inScope(simc));
  assert.deepEqual(terytDiff(ours, ulic, simc, TERCS), []);
});

test("every kind of change, by id; other gminy ignored", () => {
  const ours = oursFromTeryt(inScope(ulic), inScope(simc));
  // Ours before: Rynek was "pl. Rynek"; Kolejowa had another SYM_UL (a
  // rename); Lubasy was "Lubasie" and its own village; one street we no
  // longer find.
  const street = (sym: string) => {
    const found = ours.streets.find((s) => s.symUl === sym);
    assert.ok(found);
    return found;
  };
  street("19253").cecha = "pl.";
  street("08828").symUl = "08827";
  const lubasy = ours.localities.find((l) => l.simc === "0605921");
  assert.ok(lubasy);
  lubasy.name = "Lubasie";
  lubasy.parent = null;
  // TERYT now: Mickiewicza's osiedle gone, a new locality.
  const now = ulic.filter((r) => r.symUl !== "12741");
  const simcNow = [
    ...simc,
    { ...simc[1], simc: "0605999", name: "Nowa", parent: null },
  ];
  const changes = terytDiff(ours, now, simcNow, TERCS);
  const brief = changes.map((c) => `${c.code} ${c.id} ${c.what}`);
  assert.deepEqual(brief, [
    "D 0605890-08828 ul. Kolejowa, Basznia Dolna",
    "D 0605999 Nowa",
    'M 0605921 renamed "Lubasie" → "Lubasy"',
    "M 0605921 Lubasy: part of none → Basznia Dolna",
    'M 0972447-19253 "pl. Rynek" → "ul. Rynek", Lubaczów',
    "U 0605890-08827 ul. Kolejowa, Basznia Dolna",
    "U 0972447-12741 os. Osiedle Mickiewicza, Lubaczów",
  ]);
  // The rename's candidate: the new street in the same locality.
  assert.deepEqual(changes.find((c) => c.id === "0605890-08827")?.maybe, [
    "0605890-08828 ul. Kolejowa",
  ]);
  assert.match(changesTable(changes), /\| U \| ulica \| `0605890-08827` \|/);
});

test("place rows: our gminy only, by id, with kind and parent, streets with CECHA and NAZWA_1", () => {
  assert.deepEqual(placeRows(ulic, simc, TERCS), {
    localities: [
      "0605890;Basznia Dolna;wies;",
      "0605921;Lubasy;czesc_wsi;0605890",
      "0972447;Lubaczów;miasto;",
    ],
    streets: [
      "0605890-08828;0605890;Kolejowa;ul.;Kolejowa",
      "0972447-00470;0972447;Adama Asnyka;ul.;Asnyka",
      "0972447-12740;0972447;Adama Mickiewicza;ul.;Mickiewicza",
      "0972447-12741;0972447;Osiedle Mickiewicza;os.;Osiedle Mickiewicza",
      "0972447-19253;0972447;Rynek;ul.;Rynek",
    ],
  });
});
