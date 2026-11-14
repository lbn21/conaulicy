import assert from "node:assert/strict";
import { test } from "node:test";
import { todayInWarsaw, warsawToIso } from "./dates.ts";
import { days, WINDOW, windowOf } from "./window.ts";

// The site's one 7-day window (lib/window.ts): the address page's
// timeline and counts and the home page's panel read it alike.

const at = (wall: string) => new Date(Date.parse(warsawToIso(wall) as string));
const inWindow = (today: string, day: string) => {
  const w = windowOf(today);
  return day >= w.from && day < w.until;
};

test("the window: today and the next six days, then the day after", () => {
  assert.deepEqual(windowOf("2026-11-14"), {
    from: "2026-11-14",
    to: "2026-11-20",
    until: "2026-11-21",
  });
  assert.equal(days("2026-11-14").length, WINDOW);
  assert.equal(days("2026-11-14").at(-1), windowOf("2026-11-14").to);
});

test("a Saturday's window holds the next Monday to Thursday, not the next Saturday", () => {
  // 14 Nov 2026 is a Saturday.
  assert.ok(inWindow("2026-11-14", "2026-11-14"));
  assert.ok(inWindow("2026-11-14", "2026-11-16"));
  assert.ok(inWindow("2026-11-14", "2026-11-19"));
  assert.ok(inWindow("2026-11-14", "2026-11-20"));
  assert.ok(!inWindow("2026-11-14", "2026-11-21"));
  assert.ok(!inWindow("2026-11-14", "2026-11-13"));
});

test("the window moves at Warsaw midnight, not UTC's", () => {
  // 23:30 Warsaw on Saturday is 22:30 UTC: still Saturday's window.
  assert.equal(
    windowOf(todayInWarsaw(at("2026-11-14 23:30:00"))).from,
    "2026-11-14",
  );
  // 00:30 Warsaw on Sunday is 23:30 UTC on Saturday: Sunday's window.
  assert.equal(
    windowOf(todayInWarsaw(at("2026-11-15 00:30:00"))).from,
    "2026-11-15",
  );
});

test("calendar days across DST, months and years", () => {
  // The 25-hour day of 25 Oct 2026 and the 23-hour one of 28 Mar 2027.
  assert.deepEqual(windowOf("2026-10-22"), {
    from: "2026-10-22",
    to: "2026-10-28",
    until: "2026-10-29",
  });
  assert.deepEqual(days("2027-03-27", 3), [
    "2027-03-27",
    "2027-03-28",
    "2027-03-29",
  ]);
  assert.equal(todayInWarsaw(at("2026-10-25 23:30:00")), "2026-10-25");
  assert.equal(todayInWarsaw(at("2027-03-28 23:30:00")), "2027-03-28");
  assert.deepEqual(windowOf("2026-12-28"), {
    from: "2026-12-28",
    to: "2027-01-03",
    until: "2027-01-04",
  });
  assert.deepEqual(days("2026-11-28", 4), [
    "2026-11-28",
    "2026-11-29",
    "2026-11-30",
    "2026-12-01",
  ]);
});
