import assert from "node:assert/strict";
import { test } from "node:test";
import { momentRange } from "./date-labels.ts";

// Intl's spaces may be thin or no-break ones: compared as plain spaces.
const range = (from: string, to: string) =>
  momentRange(Date.parse(from), Date.parse(to)).map((s) =>
    s.replace(/\s/g, " "),
  );

test("momentRange: Intl's range split at its dash, for „od … do …”", () => {
  // The same day: the day once, then the end's time alone.
  assert.deepEqual(
    range("2026-11-11T10:00:00+01:00", "2026-11-11T16:00:00+01:00"),
    ["11 listopada, 10:00", "16:00"],
  );
  // Across midnight: both days.
  assert.deepEqual(
    range("2026-11-11T22:00:00+01:00", "2026-11-12T04:00:00+01:00"),
    ["11 listopada, 22:00", "12 listopada, 4:00"],
  );
  // In Warsaw's time, across the change to winter time (Intl pads the
  // hour here; the site's style drops the zero).
  assert.deepEqual(
    range("2026-10-25T01:00:00+02:00", "2026-10-25T05:00:00+01:00"),
    ["25 października, 1:00", "5:00"],
  );
});

test("momentRange: the same minute, one moment twice", () => {
  const [from, to] = range(
    "2026-11-11T10:00:00+01:00",
    "2026-11-11T10:00:30+01:00",
  );
  assert.equal(from, to);
  assert.match(from, /^11 listopada, 10:00$/);
});

test("momentRange: the site's „day, H:MM” style, built from Intl's parts", () => {
  // The same day: a comma after the month, the end's time alone.
  assert.deepEqual(
    range("2026-11-14T14:00:00+01:00", "2026-11-14T18:30:00+01:00"),
    ["14 listopada, 14:00", "18:30"],
  );
  // Across days: both sides with their comma.
  assert.deepEqual(
    range("2026-11-14T14:00:00+01:00", "2026-11-15T20:00:00+01:00"),
    ["14 listopada, 14:00", "15 listopada, 20:00"],
  );
  // An hour before 10: no leading zero, on either side.
  assert.deepEqual(
    range("2026-11-14T07:05:00+01:00", "2026-11-15T08:30:00+01:00"),
    ["14 listopada, 7:05", "15 listopada, 8:30"],
  );
});
