import assert from "node:assert/strict";
import { test } from "node:test";
import { hasUpcoming, UNVERIFIED_NOTE } from "./schedule-notes.ts";

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
