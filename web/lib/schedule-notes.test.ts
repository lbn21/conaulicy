import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DISCLAIMER,
  disclaimer,
  hasUpcoming,
  laterNote,
  placeDescription,
  putOutLine,
  putOutNote,
  unverifiedNote,
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

test("the address page's put-out line: „rano” before noon only", () => {
  assert.equal(putOutLine("06:00"), "Wystaw je do 6:00 rano.");
  assert.equal(putOutLine("11:59"), "Wystaw je do 11:59 rano.");
  assert.equal(putOutLine("12:00"), "Wystaw je do 12:00 w dniu odbioru.");
});

test("the unverified note names whose schedule wins: the gmina's, or the town's", () => {
  assert.equal(
    unverifiedNote("Lubaczów (gmina)"),
    "Te daty przepisał automatycznie program. Jeśli coś się nie zgadza, ważniejszy jest harmonogram gminy.",
  );
  assert.equal(
    unverifiedNote("Lubaczów (miasto)"),
    "Te daty przepisał automatycznie program. Jeśli coś się nie zgadza, ważniejszy jest harmonogram Urzędu Miejskiego.",
  );
  assert.equal(
    disclaimer("Lubaczów (miasto)"),
    "Nie jesteśmy urzędem – obowiązuje harmonogram Urzędu Miejskiego.",
  );
  assert.equal(
    disclaimer("Lubaczów (gmina)"),
    "Nie jesteśmy urzędem – obowiązuje harmonogram gminy.",
  );
  assert.equal(
    DISCLAIMER,
    "Nie jesteśmy urzędem – ważniejszy jest komunikat urzędu.",
  );
});

test("after the last date: the next year's dates come when published", () => {
  assert.equal(
    laterNote([day("2026-11-02"), day("2026-12-31")]),
    "Terminy na kolejny rok dodamy, gdy je ogłoszą.",
  );
  assert.equal(laterNote([]), null);
});

test("a place's description offers dates only when the page has them", () => {
  const place = {
    label: "ul. Rynek, Lubaczów",
    gmina: "Lubaczów (miasto)",
    zoneId: "lubaczow-1",
    days: [day("2026-12-28")],
    today: "2026-12-01",
  };
  assert.match(placeDescription(place), /: ul\. Rynek, Lubaczów\. /);
  assert.match(placeDescription(place), /Najbliższe terminy/);
  const none = /: ul\. Rynek, Lubaczów\. Terminów wywozu jeszcze tu nie mamy/;
  assert.match(placeDescription({ ...place, zoneId: null, days: [] }), none);
  assert.match(placeDescription({ ...place, today: "2027-01-02" }), none);
  for (const label of [
    "Dąbrowa (Basznia Górna, gm. Lubaczów)",
    "ul. Generała Władysława Andersa, Lubaczów",
    "ul. Kardynała Stefana Wyszyńskiego, Lubaczów",
  ]) {
    assert.ok(placeDescription({ ...place, label }).length <= 160);
    assert.ok(placeDescription({ ...place, label }, "waste").length <= 160);
  }
});

test("the waste subpage's description is its own", () => {
  const place = {
    label: "ul. Rynek, Lubaczów",
    gmina: "Lubaczów (miasto)",
    zoneId: "lubaczow-1",
    days: [day("2026-12-28")],
    today: "2026-12-01",
  };
  assert.equal(
    placeDescription(place, "waste"),
    "Pełna lista odbiorów śmieci: ul. Rynek, Lubaczów. Wszystkie terminy do kalendarza w telefonie i harmonogram do druku (PDF).",
  );
  for (const variant of [place, { ...place, zoneId: null, days: [] }]) {
    assert.notEqual(
      placeDescription(variant, "waste"),
      placeDescription(variant),
    );
  }
});
