import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type Alert,
  alertSlot,
  checkedLine,
  MAX_ALERTS,
  warningCount,
} from "./hub.ts";

const alert = (from: string): Alert => ({
  text: `od ${from}`,
  href: "https://example.org/",
  link: "Więcej",
  short: "Źródło",
  from,
});

test("the slot shows two lines at most, the rest counted", () => {
  assert.equal(MAX_ALERTS, 2);
  const one = [{ order: 1, alert: alert("2026-10-25T13:00:00+01:00") }];
  assert.deepEqual(alertSlot(one), { shown: one, more: 0 });
  const four = [10, 11, 12, 13].map((hour) => ({
    order: 1,
    alert: alert(`2026-10-25T${hour}:00:00+01:00`),
  }));
  const { shown, more } = alertSlot(four);
  assert.equal(shown.length, 2);
  assert.equal(more, 2);
  assert.deepEqual(alertSlot([]), { shown: [], more: 0 });
});

test("registry order first, then the soonest", () => {
  const late = { order: 0, alert: alert("2026-10-26T08:00:00+01:00") };
  const early = { order: 1, alert: alert("2026-10-25T08:00:00+01:00") };
  const earlier = { order: 1, alert: alert("2026-10-25T06:00:00+01:00") };
  assert.deepEqual(alertSlot([early, earlier, late], 3).shown, [
    late,
    earlier,
    early,
  ]);
});

test("Polish plurals for the count", () => {
  assert.deepEqual([1, 2, 4, 5, 11, 12, 14, 21, 22, 25].map(warningCount), [
    "1 ostrzeżenie",
    "2 ostrzeżenia",
    "4 ostrzeżenia",
    "5 ostrzeżeń",
    "11 ostrzeżeń",
    "12 ostrzeżeń",
    "14 ostrzeżeń",
    "21 ostrzeżeń",
    "22 ostrzeżenia",
    "25 ostrzeżeń",
  ]);
});

test("checked line: a day alone, an instant with its Warsaw time", () => {
  assert.equal(
    checkedLine("2026-10-23"),
    "Ostatnio sprawdziliśmy: 23 października",
  );
  // 22:30 UTC on 31 August is already 1 September in Warsaw.
  assert.equal(
    checkedLine(new Date("2026-08-31T22:30:00Z")),
    "Ostatnio sprawdziliśmy: 1 września, 0:30",
  );
  assert.equal(
    checkedLine(new Date("2026-10-25T14:42:00Z")),
    "Ostatnio sprawdziliśmy: 25 października, 15:42",
  );
  assert.equal(checkedLine(null), null);
});
