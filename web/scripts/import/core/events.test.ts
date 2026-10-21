import assert from "node:assert/strict";
import { test } from "node:test";
import { coverageGaps, diffEvents } from "./events.ts";

test("diff: added, removed, changed columns", () => {
  const a = { id: "1", start: "2026-01-05", payload: { x: 1, y: 2 } };
  const b = { id: "2", start: "2026-01-06" };
  const d = diffEvents(
    [a, b],
    [
      { ...a, payload: { y: 2, x: 1 } },
      { id: "3", start: "2026-01-07" },
    ],
  );
  assert.deepEqual(
    [d.added.length, d.removed.length, d.changed.length],
    [1, 1, 0],
  );
  assert.deepEqual(
    diffEvents([a], [{ ...a, start: "2026-01-12" }]).changed[0].columns,
    ["start"],
  );
});

test("coverage: a zone ending within minDays, or empty, is a gap", () => {
  const zones = [
    { zoneId: "a", last: "2026-12-28" },
    { zoneId: "b", last: "2027-03-01" },
    { zoneId: "c", last: null },
  ];
  assert.deepEqual(coverageGaps(zones, "2026-12-10", 21), [
    "a: last date 2026-12-28",
    "c: no dates",
  ]);
  assert.deepEqual(coverageGaps(zones.slice(0, 2), "2026-10-21", 21), []);
});
