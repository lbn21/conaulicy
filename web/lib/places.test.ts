import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hasZone,
  isSplitStreet,
  localityAnchor,
  localitySearchLabel,
  movedPath,
  pickZone,
  placeList,
  scheduleName,
  streetLabel,
  streetName,
  terytName,
  titleLabel,
  villageLabel,
} from "./places.ts";

test("village parts name their village, villages their gmina", () => {
  const gmina = "Lubaczów (gmina)";
  assert.equal(
    villageLabel({ name: "Dąbrowa", parent: null, gmina }),
    "Dąbrowa (gm. Lubaczów)",
  );
  assert.equal(
    villageLabel({ name: "Dąbrowa", parent: "Basznia Górna", gmina }),
    "Dąbrowa (Basznia Górna, gm. Lubaczów)",
  );
  assert.equal(
    localitySearchLabel({
      name: "Lubaczów",
      kind: "miasto",
      parent: null,
      gmina: "Lubaczów (miasto)",
    }),
    "Lubaczów",
  );
});

test("a title names the place's locality, one name in two places apart", () => {
  assert.equal(titleLabel("ul. Leśna, Lubaczów"), "ul. Leśna, Lubaczów");
  assert.equal(
    titleLabel("ul. Leśna, Basznia Dolna"),
    "ul. Leśna, Basznia Dolna",
  );
  assert.equal(titleLabel("Antoniki (gm. Lubaczów)"), "Antoniki, gm. Lubaczów");
  assert.equal(
    titleLabel("Dąbrowa (Basznia Górna, gm. Lubaczów)"),
    "Dąbrowa, Basznia Górna, gm. Lubaczów",
  );
});

test("street names do not repeat their prefix", () => {
  assert.equal(streetName("ul.", "Adama Asnyka"), "ul. Adama Asnyka");
  assert.equal(streetName("os.", "Osiedle Mickiewicza"), "Osiedle Mickiewicza");
  assert.equal(
    streetName("al.", "aleja kardynała Mariana Jaworskiego"),
    "aleja kardynała Mariana Jaworskiego",
  );
  assert.equal(
    streetName("rondo", "Rondo im. Zesłańców Sybiru"),
    "Rondo im. Zesłańców Sybiru",
  );
  assert.equal(streetName("os.", "Słoneczne"), "os. Słoneczne");
  assert.equal(
    streetLabel({ prefix: "ul.", name: "Polna", locality: "Lisie Jamy" }),
    "ul. Polna, Lisie Jamy",
  );
});

test("pickZone: street entry, then own locality, then the parent village", () => {
  const street = { zoneId: "z-street", localityId: "L", streetId: "L-1" };
  const own = { zoneId: "z-own", localityId: "P1", streetId: null };
  const parent = { zoneId: "z-parent", localityId: "V", streetId: null };
  const part = { localityId: "P1", parentId: "V" };

  assert.equal(pickZone([parent], part), "z-parent");
  assert.equal(pickZone([parent, own], part), "z-own");
  assert.equal(pickZone([], part), null);
  assert.equal(
    pickZone([street, { zoneId: "z-town", localityId: "L", streetId: null }], {
      localityId: "L",
      parentId: null,
      streetId: "L-1",
    }),
    "z-street",
  );
  // Another street's entry never counts.
  assert.equal(
    pickZone([street], { localityId: "L", parentId: null, streetId: "L-2" }),
    null,
  );
});

test("hasZone: own, locality's, village's or a split street's parts", () => {
  const members = [
    { zoneId: "z1", localityId: "L", streetId: "L-1" },
    { zoneId: "z2", localityId: "V", streetId: null },
    { zoneId: "z3", localityId: "L", streetId: "L-2", parity: "odd" as const },
  ];
  const street = (streetId: string) => ({
    localityId: "L",
    parentId: null,
    streetId,
  });
  assert.equal(hasZone(members, street("L-1")), true);
  assert.equal(hasZone(members, street("L-2")), true);
  assert.equal(hasZone(members, street("L-3")), false);
  assert.equal(hasZone(members, { localityId: "P", parentId: "V" }), true);
  assert.equal(hasZone(members, { localityId: "W", parentId: null }), false);
});

test("a schedule link names who publishes it", () => {
  assert.equal(
    scheduleName("Lubaczów (miasto)"),
    "harmonogram Urzędu Miejskiego w Lubaczowie",
  );
  assert.equal(
    scheduleName("Lubaczów (gmina)"),
    "harmonogram Urzędu Gminy Lubaczów",
  );
  assert.equal(scheduleName("Oleszyce (gmina)"), "harmonogram gminy Oleszyce");
});

test("pickZone: a split street needs the house number", () => {
  const even = {
    zoneId: "z-even",
    localityId: "L",
    streetId: "L-1",
    houseFrom: null,
    houseTo: null,
    parity: "even" as const,
  };
  const odd = { ...even, zoneId: "z-odd", parity: "odd" as const };
  const lowOdd = { ...odd, zoneId: "z-low", houseTo: "9" };
  const town = { zoneId: "z-town", localityId: "L", streetId: null };
  const street = { localityId: "L", parentId: null, streetId: "L-1" };

  assert.equal(isSplitStreet([even, odd], street), true);
  assert.equal(isSplitStreet([town], street), false);
  // No number: no guess, not even the town's zone.
  assert.equal(pickZone([even, odd, town], street), null);
  assert.equal(pickZone([even, odd], { ...street, nr: "12a" }), "z-even");
  assert.equal(pickZone([even, odd], { ...street, nr: "7/22" }), "z-odd");
  // A range with a bound: odd numbers up to 9.
  assert.equal(pickZone([lowOdd, even], { ...street, nr: "7" }), "z-low");
  // Not covered by any range: the town's zone, if there is one.
  assert.equal(
    pickZone([lowOdd, even, town], { ...street, nr: "11" }),
    "z-town",
  );
  assert.equal(pickZone([lowOdd, even], { ...street, nr: "11" }), null);
  // A number on a street that is not split changes nothing.
  assert.equal(pickZone([town], { ...street, nr: "12" }), "z-town");
});

test("/ulice lists the town by letter in Polish order, villages with their streets", () => {
  // Lisie Jamy has streets and is a place too: one line, its streets under it.
  const town = (id: string, name: string, prefix = "ul.") => ({
    id,
    prefix,
    name,
    localityId: "0972447",
    locality: "Lubaczów",
    localityKind: "miasto" as const,
  });
  const list = placeList(
    [
      town("6", "Źródlana"),
      town("1", "Leśna"),
      town("2", "Łąkowa"),
      town("3", "Szkolna"),
      town("4", "Śląska"),
      town("5", "Żeromskiego"),
      town("7", "Zielona", "al."),
      town("8", "3 Maja"),
      {
        id: "9",
        prefix: "ul.",
        name: "Polna",
        localityId: "0606234",
        locality: "Lisie Jamy",
        localityKind: "wies",
      },
    ],
    [
      { id: "10", name: "Szczutków", parent: null, gmina: "Lubaczów (gmina)" },
      { id: "11", name: "Dąbrowa", parent: null, gmina: "Lubaczów (gmina)" },
      {
        id: "0606234",
        name: "Lisie Jamy",
        parent: null,
        gmina: "Lubaczów (gmina)",
      },
    ],
  );
  assert.deepEqual(
    list.town.map(({ letter, places }) => [
      letter,
      places.map((p) => p.label).join(", "),
    ]),
    [
      ["0–9", "ul. 3 Maja"],
      ["L", "ul. Leśna"],
      ["Ł", "ul. Łąkowa"],
      ["S", "ul. Szkolna"],
      ["Ś", "ul. Śląska"],
      ["Z", "al. Zielona"],
      ["Ź", "ul. Źródlana"],
      ["Ż", "ul. Żeromskiego"],
    ],
  );
  // The group headings' SIMC: the town's, and each village's.
  assert.equal(list.townId, "0972447");
  assert.equal(localityAnchor("0972447"), "m-0972447");
  assert.deepEqual(list.villages, [
    { id: "11", label: "Dąbrowa (gm. Lubaczów)", streets: [] },
    {
      id: "0606234",
      label: "Lisie Jamy (gm. Lubaczów)",
      streets: [{ id: "9", label: "ul. Polna" }],
    },
    {
      id: "10",
      label: "Szczutków (gm. Lubaczów)",
      streets: [],
    },
  ]);
});

test("a street's name in TERYT's order: NAZWA_2, then NAZWA_1", () => {
  assert.equal(terytName("Asnyka", "Adama"), "Adama Asnyka");
  assert.equal(terytName("Rynek", null), "Rynek");
  assert.equal(
    streetName("os.", terytName("Osiedle Mickiewicza", null)),
    "Osiedle Mickiewicza",
  );
});

test("a moved place: every address under the old id, query kept", () => {
  const move = (path: string) =>
    movedPath(path, "0972447-99999", "0972447-00470");
  assert.equal(move("/adres/0972447-99999"), "/adres/0972447-00470");
  assert.equal(
    move("/adres/0972447-99999?nr=7/22"),
    "/adres/0972447-00470?nr=7/22",
  );
  assert.equal(
    move("/adres/0972447-99999/harmonogram.pdf?nr=12"),
    "/adres/0972447-00470/harmonogram.pdf?nr=12",
  );
  assert.equal(
    move("/adres/0972447-99999/numer"),
    "/adres/0972447-00470/numer",
  );
  // Only that id: never a longer one, nor another page.
  assert.equal(move("/adres/0972447-999990"), null);
  assert.equal(move("/ulice"), null);
});
