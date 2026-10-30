import assert from "node:assert/strict";
import { test } from "node:test";
import { checkedLine, metaLine } from "./hub.ts";

test("checked line: a day alone, an instant with its Warsaw time, over midnight and DST", () => {
  assert.equal(
    checkedLine("2026-10-23", "pogoda"),
    "Ostatnio sprawdziliśmy: 23 października",
  );
  // 22:30 UTC on 31 August is already 1 September in Warsaw.
  assert.equal(
    checkedLine(new Date("2026-08-31T22:30:00Z"), "pogoda"),
    "Ostatnio sprawdziliśmy: 1 września, 0:30",
  );
  assert.equal(
    checkedLine(new Date("2026-10-25T14:42:00Z"), "pogoda"),
    "Ostatnio sprawdziliśmy: 25 października, 15:42",
  );
  assert.equal(checkedLine(null, "pogoda"), null);
  // Waste and water say what they checked.
  assert.equal(
    checkedLine("2026-10-23", "smieci"),
    "Wywozy sprawdziliśmy: 23 października",
  );
  assert.equal(
    checkedLine(new Date("2026-10-25T14:42:00Z"), "woda"),
    "Komunikaty o wodzie sprawdziliśmy: 25 października, 15:42",
  );
  const line = (iso: string) => checkedLine(new Date(iso), "pogoda");
  // Summer time until 3:00 on 25 Oct: midnight is 22:00 UTC the day before.
  assert.equal(
    line("2026-10-24T21:59:00Z"),
    "Ostatnio sprawdziliśmy: 24 października, 23:59",
  );
  assert.equal(
    line("2026-10-24T22:00:00Z"),
    "Ostatnio sprawdziliśmy: 25 października, 0:00",
  );
  // 2:30 happens twice: CEST (0:30 UTC), then CET (1:30 UTC).
  assert.equal(
    line("2026-10-25T00:30:00Z"),
    "Ostatnio sprawdziliśmy: 25 października, 2:30",
  );
  assert.equal(
    line("2026-10-25T01:30:00Z"),
    "Ostatnio sprawdziliśmy: 25 października, 2:30",
  );
  // From then on, CET: midnight is 23:00 UTC.
  assert.equal(
    line("2026-10-25T22:59:00Z"),
    "Ostatnio sprawdziliśmy: 25 października, 23:59",
  );
  assert.equal(
    line("2026-10-25T23:00:00Z"),
    "Ostatnio sprawdziliśmy: 26 października, 0:00",
  );
});

test("meta line: sources joined, a note, then when we checked, absolute", () => {
  const link = (text: string) => ({
    href: `https://example.org/${text}`,
    text,
  });
  assert.deepEqual(
    metaLine(
      [[link("a"), ", sektor 1"], [link("b")]],
      "Daty przepisał program.",
      new Date("2026-10-28T14:52:00Z"),
    ),
    [
      "Źródło: ",
      link("a"),
      ", sektor 1; ",
      link("b"),
      ". Daty przepisał program. Sprawdziliśmy 28 października, 15:52.",
    ],
  );
  // A day only; no note.
  assert.deepEqual(metaLine([["IMGW-PIB"]], null, "2026-10-23"), [
    "Źródło: IMGW-PIB. Sprawdziliśmy 23 października.",
  ]);
  // Never checked: the source alone.
  assert.deepEqual(metaLine([[link("a")]], null, null), [
    "Źródło: ",
    link("a"),
    ".",
  ]);
});

test("meta line: no source, no „Źródło”; what is left, or nothing", () => {
  assert.deepEqual(metaLine([], null, null), []);
  assert.deepEqual(metaLine([], "Daty przepisał program.", null), [
    "Daty przepisał program.",
  ]);
  assert.deepEqual(metaLine([], null, "2026-10-23"), [
    "Sprawdziliśmy 23 października.",
  ]);
  assert.deepEqual(
    metaLine([], "Daty przepisał program.", new Date("2026-10-28T14:52:00Z")),
    ["Daty przepisał program. Sprawdziliśmy 28 października, 15:52."],
  );
});
