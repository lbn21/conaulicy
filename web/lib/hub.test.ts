import assert from "node:assert/strict";
import { test } from "node:test";
import { freshnessLine, sourceLine } from "./hub.ts";

/** The check alone, as a subpage's source block says it. */
const checked = (at: Parameters<typeof sourceLine>[1]) =>
  sourceLine([], at)[0] ?? null;

test("check time: a day alone, an instant with its Warsaw time, over midnight and DST", () => {
  assert.equal(checked("2026-10-23"), "Sprawdziliśmy 23 października.");
  // 22:30 UTC on 31 August is already 1 September in Warsaw.
  assert.equal(
    checked(new Date("2026-08-31T22:30:00Z")),
    "Sprawdziliśmy 1 września 0:30.",
  );
  assert.equal(
    checked(new Date("2026-10-25T14:42:00Z")),
    "Sprawdziliśmy 25 października 15:42.",
  );
  assert.equal(checked(null), null);
  assert.equal(checked("2026-10-23"), "Sprawdziliśmy 23 października.");
  assert.equal(
    checked(new Date("2026-10-25T14:42:00Z")),
    "Sprawdziliśmy 25 października 15:42.",
  );
  const line = (iso: string) => checked(new Date(iso));
  // Summer time until 3:00 on 25 Oct: midnight is 22:00 UTC the day before.
  assert.equal(
    line("2026-10-24T21:59:00Z"),
    "Sprawdziliśmy 24 października 23:59.",
  );
  assert.equal(
    line("2026-10-24T22:00:00Z"),
    "Sprawdziliśmy 25 października 0:00.",
  );
  // 2:30 happens twice: CEST (0:30 UTC), then CET (1:30 UTC).
  assert.equal(
    line("2026-10-25T00:30:00Z"),
    "Sprawdziliśmy 25 października 2:30.",
  );
  assert.equal(
    line("2026-10-25T01:30:00Z"),
    "Sprawdziliśmy 25 października 2:30.",
  );
  // From then on, CET: midnight is 23:00 UTC.
  assert.equal(
    line("2026-10-25T22:59:00Z"),
    "Sprawdziliśmy 25 października 23:59.",
  );
  assert.equal(
    line("2026-10-25T23:00:00Z"),
    "Sprawdziliśmy 26 października 0:00.",
  );
});

test("source line: sources joined, then when we checked, absolute", () => {
  const link = (text: string) => ({
    href: `https://example.org/${text}`,
    text,
  });
  assert.deepEqual(
    sourceLine(
      [[link("a"), ", sektor 1"], [link("b")]],
      new Date("2026-10-28T14:52:00Z"),
    ),
    [
      "Źródło: ",
      link("a"),
      ", sektor 1; ",
      link("b"),
      ". Sprawdziliśmy 28 października 15:52.",
    ],
  );
  assert.deepEqual(sourceLine([["IMGW-PIB"]], "2026-10-23"), [
    "Źródło: IMGW-PIB. Sprawdziliśmy 23 października.",
  ]);
  // Never checked: the source alone; neither: nothing.
  assert.deepEqual(sourceLine([[link("a")]], null), [
    "Źródło: ",
    link("a"),
    ".",
  ]);
  assert.deepEqual(sourceLine([], null), []);
});

test("freshness line: each module with a known check, in order, as a Polish list", () => {
  assert.equal(
    freshnessLine([
      { name: "śmieci", at: new Date("2026-11-10T21:40:00Z") },
      { name: "woda", at: new Date("2026-11-11T06:00:00Z") },
      { name: "pogoda", at: new Date("2026-11-11T06:07:00Z") },
    ]),
    "Sprawdziliśmy: śmieci 10 listopada 22:40, woda 11 listopada 7:00 i pogoda 11 listopada 7:07.",
  );
  assert.equal(
    freshnessLine([
      { name: "śmieci", at: "2026-10-23" },
      { name: "woda", at: null },
      { name: "pogoda", at: new Date("2026-11-11T06:07:00Z") },
    ]),
    "Sprawdziliśmy: śmieci 23 października i pogoda 11 listopada 7:07.",
  );
  assert.equal(freshnessLine([{ name: "woda", at: null }]), null);
});
