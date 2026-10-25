import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hasUpcoming,
  placeDescription,
  putOutNote,
  sharedNumberNote,
  UNVERIFIED_NOTE,
} from "./schedule-notes.ts";

const day = (date: string) => ({
  date,
  pickups: [
    {
      id: date,
      subtype: "zmieszane",
      label: "Zmieszane",
      putOutBy: null,
      shiftedFrom: null,
    },
  ],
});

test("a place whose dates are all in the past has nothing upcoming", () => {
  // As around New Year: the schedule ends in late December.
  const past = [day("2026-12-14"), day("2026-12-28"), day("2026-12-30")];
  assert.equal(hasUpcoming(past, "2027-01-02"), false);
  assert.equal(hasUpcoming([], "2027-01-02"), false);
});

test("today and later count as upcoming", () => {
  const days = [day("2026-12-28"), day("2026-12-30")];
  assert.equal(hasUpcoming(days, "2026-12-30"), true);
  assert.equal(hasUpcoming(days, "2026-12-01"), true);
});

test("the put-out note gives the data's hour without a leading zero", () => {
  assert.equal(putOutNote("06:00"), "Wystaw pojemniki do 6:00 w dniu odbioru.");
  assert.equal(putOutNote("6:00"), "Wystaw pojemniki do 6:00 w dniu odbioru.");
  // Another hour in another zone.
  assert.equal(putOutNote("07:30"), "Wystaw pojemniki do 7:30 w dniu odbioru.");
  assert.equal(
    putOutNote("10:00"),
    "Wystaw pojemniki do 10:00 w dniu odbioru.",
  );
});

test("the unverified note sends people to the gmina's schedule", () => {
  assert.match(UNVERIFIED_NOTE, /nikt ich jeszcze nie sprawdził/);
  assert.match(UNVERIFIED_NOTE, /rację ma harmonogram gminy\.$/);
});

test("a place's description offers dates only when the page has them", () => {
  const place = {
    label: "ul. Rynek, Lubaczów",
    zoneId: "lubaczow-1",
    askNumber: false,
    days: [day("2026-12-28")],
    today: "2026-12-01",
  };
  assert.equal(
    placeDescription(place),
    "Terminy wywozu śmieci: ul. Rynek, Lubaczów. Dodaj je do kalendarza w telefonie albo pobierz harmonogram do wydruku.",
  );
  // A split street: the dates come with the house number.
  assert.match(
    placeDescription({ ...place, zoneId: "x", askNumber: true, days: [] }),
    /^Terminy wywozu/,
  );
  const none =
    /^Wywóz śmieci: ul\. Rynek, Lubaczów\. Terminów jeszcze tu nie mamy/;
  assert.match(placeDescription({ ...place, zoneId: null, days: [] }), none);
  assert.match(placeDescription({ ...place, today: "2027-01-02" }), none);
  for (const label of [
    "Dąbrowa (Basznia Górna, gm. Lubaczów)",
    "ul. Generała Władysława Andersa, Lubaczów",
  ]) {
    assert.ok(placeDescription({ ...place, label }).length <= 160);
    assert.ok(placeDescription({ ...place, label }, "waste").length <= 160);
  }
});

test("the waste subpage's description is its own", () => {
  const place = {
    label: "ul. Rynek, Lubaczów",
    zoneId: "lubaczow-1",
    askNumber: false,
    days: [day("2026-12-28")],
    today: "2026-12-01",
  };
  assert.equal(
    placeDescription(place, "waste"),
    "Wszystkie terminy wywozu śmieci: ul. Rynek, Lubaczów. Dodaj je do kalendarza albo pobierz harmonogram do wydruku.",
  );
  for (const variant of [place, { ...place, zoneId: null, days: [] }]) {
    assert.notEqual(
      placeDescription(variant, "waste"),
      placeDescription(variant),
    );
  }
});

// As the CI fixture's views: 0972447-00470 (ul. Adama Asnyka) has one zone,
// 0972447-90004 is split by house numbers (scripts/ci-fixture.ts).
const asnyka = {
  kind: "ulica" as const,
  zoneId: "lubaczow-sektor-1",
  nr: null,
  askNumber: false,
  givenNr: null,
};

test("a number on a street with one schedule is acknowledged", () => {
  assert.equal(
    sharedNumberNote({ ...asnyka, givenNr: "5" }),
    "Harmonogram jest wspólny dla całej ulicy, także dla nr 5.",
  );
  // As normalised by lib/house.ts: lower case, the slash kept.
  assert.equal(
    sharedNumberNote({ ...asnyka, givenNr: "7/22" }),
    "Harmonogram jest wspólny dla całej ulicy, także dla nr 7/22.",
  );
});

test("a number the address register lacks is not repeated", () => {
  assert.equal(
    sharedNumberNote({ ...asnyka, givenNr: "9999" }, true),
    "Harmonogram jest wspólny dla całej ulicy.",
  );
});

test("no number, no note", () => {
  assert.equal(sharedNumberNote(asnyka), null);
});

test("a split street (0972447-90004) never shows the note", () => {
  const split = { ...asnyka, zoneId: "lubaczow-sektor-2" };
  // The number picks its part: the page shows it after the name.
  assert.equal(sharedNumberNote({ ...split, nr: "7a", givenNr: "7a" }), null);
  // A number no part has: the page asks again, with the error.
  assert.equal(
    sharedNumberNote({
      ...split,
      zoneId: null,
      askNumber: true,
      givenNr: "42",
    }),
    null,
  );
  // No number yet: the question.
  assert.equal(
    sharedNumberNote({ ...split, zoneId: null, askNumber: true }),
    null,
  );
});

test("a village or a street without dates never shows the note", () => {
  assert.equal(
    sharedNumberNote({ ...asnyka, kind: "wies", givenNr: "5" }),
    null,
  );
  assert.equal(
    sharedNumberNote({ ...asnyka, zoneId: null, givenNr: "5" }),
    null,
  );
});
