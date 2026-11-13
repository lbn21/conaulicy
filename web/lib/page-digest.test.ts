import assert from "node:assert/strict";
import test from "node:test";
import { digestOf } from "./page-digest.ts";

const NOW = Date.parse("2026-11-13T10:00:00+01:00");
const view = {
  place: { id: "0972447-00470", today: "2026-11-13" },
  cuts: [
    { start: "2026-11-13T12:00:00+01:00", end: "2026-11-13T15:00:00+01:00" },
  ],
  changedAt: NOW - 60_000,
};

test("identical views: one digest, whatever their keys' order", () => {
  assert.equal(digestOf(view, NOW), digestOf(structuredClone(view), NOW));
  const reordered = {
    changedAt: view.changedAt,
    cuts: view.cuts.map(({ end, start }) => ({ end, start })),
    place: { today: view.place.today, id: view.place.id },
  };
  assert.equal(digestOf(reordered, NOW), digestOf(view, NOW));
  assert.equal(digestOf(null, NOW), digestOf(null, NOW));
});

test("a change of content changes it; undefined is no content", () => {
  const moved = structuredClone(view);
  moved.cuts[0].end = "2026-11-13T16:00:00+01:00";
  assert.notEqual(digestOf(moved, NOW), digestOf(view, NOW));
  assert.equal(
    digestOf({ ...view, gone: undefined }, NOW),
    digestOf(view, NOW),
  );
});

test("when a source last changed is not hashed", () => {
  assert.equal(digestOf({ ...view, changedAt: NOW }, NOW), digestOf(view, NOW));
});

test("the clock: only an instant passing changes it", () => {
  assert.equal(digestOf(view, NOW + 3_600_000), digestOf(view, NOW));
  // The cut begins at 12:00, ends at 15:00.
  const begun = Date.parse("2026-11-13T12:00:00+01:00");
  assert.notEqual(digestOf(view, begun), digestOf(view, begun - 1));
  assert.equal(digestOf(view, begun + 60_000), digestOf(view, begun));
  const over = Date.parse("2026-11-13T15:00:00+01:00");
  assert.notEqual(digestOf(view, over), digestOf(view, over - 1));
});

test("a day is no instant: the day changes the digest only by the view", () => {
  const nextDay = Date.parse("2026-11-14T00:10:00+01:00");
  const at = (now: number, today: string) =>
    digestOf({ place: { today } }, now);
  assert.equal(at(nextDay, "2026-11-13"), at(NOW, "2026-11-13"));
  assert.notEqual(at(nextDay, "2026-11-14"), at(NOW, "2026-11-13"));
});
