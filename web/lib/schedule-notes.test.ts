import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hasUpcoming,
  placeDescription,
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
  }
});
