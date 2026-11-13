import assert from "node:assert/strict";
import { test } from "node:test";
import { CADENCES } from "./cadence.ts";
import { cadenceLine, freshnessLine, shortDayTime, sourceLine } from "./hub.ts";

test("change time: DD.MM, HH:MM in Warsaw, over midnight and DST", () => {
  // 22:30 UTC on 31 August is already 1 September in Warsaw.
  assert.equal(
    shortDayTime(Date.parse("2026-08-31T22:30:00Z")),
    "01.09, 00:30",
  );
  assert.equal(
    shortDayTime(Date.parse("2026-10-25T14:42:00Z")),
    "25.10, 15:42",
  );
  const at = (iso: string) => shortDayTime(Date.parse(iso));
  // Summer time until 3:00 on 25 Oct: midnight is 22:00 UTC the day before.
  assert.equal(at("2026-10-24T21:59:00Z"), "24.10, 23:59");
  assert.equal(at("2026-10-24T22:00:00Z"), "25.10, 00:00");
  // 2:30 happens twice: CEST (0:30 UTC), then CET (1:30 UTC).
  assert.equal(at("2026-10-25T00:30:00Z"), "25.10, 02:30");
  assert.equal(at("2026-10-25T01:30:00Z"), "25.10, 02:30");
  // From then on, CET: midnight is 23:00 UTC.
  assert.equal(at("2026-10-25T22:59:00Z"), "25.10, 23:59");
  assert.equal(at("2026-10-25T23:00:00Z"), "26.10, 00:00");
});

test("source line: sources joined", () => {
  const link = (text: string) => ({
    href: `https://example.org/${text}`,
    text,
  });
  assert.deepEqual(sourceLine([[link("a"), ", sektor 1"], [link("b")]]), [
    "Źródło: ",
    link("a"),
    ", sektor 1; ",
    link("b"),
    ".",
  ]);
  assert.deepEqual(sourceLine([["IMGW-PIB"]]), ["Źródło: IMGW-PIB."]);
  assert.deepEqual(sourceLine([]), []);
});

// The line's shape, never its words: the time unbroken (no-break spaces),
// one source unnamed, several by name in the order given, a source with
// no change time left out.
test("freshness line: when each live source's data last changed", () => {
  const nov = Date.parse("2026-11-13T16:45:00Z");
  const oct = Date.parse("2026-10-12T06:00:00Z");
  const one = freshnessLine([{ name: null, changedAt: nov, cadence: "live" }]);
  assert.match(one ?? "", /^[^\d;:]+\s13\.11,\s17:45\.$/);
  const several = freshnessLine([
    { name: "pogoda", changedAt: nov, cadence: "live" },
    { name: "prąd", changedAt: null, cadence: "live" },
    { name: "woda", changedAt: oct, cadence: "water" },
  ]);
  assert.match(
    several ?? "",
    /^[^\d;]+: pogoda\s13\.11,\s17:45; woda\s12\.10,\s08:00\.$/,
  );
  assert.doesNotMatch(several ?? "", /prąd/);
  assert.equal(
    freshnessLine([{ name: "woda", changedAt: null, cadence: "water" }]),
    null,
  );
  assert.equal(freshnessLine([]), null);
});

// The cadence line's shape, from lib/cadence.ts: one cadence, its words
// alone; several, each with the sources it covers, in CADENCES' order.
test("cadence line: how often the shown sources are checked", () => {
  const at = Date.parse("2026-11-13T16:45:00Z");
  const { live, water } = CADENCES;
  assert.equal(
    cadenceLine([{ name: null, changedAt: at, cadence: "water" }]),
    `Sprawdzamy co ${water.every}.`,
  );
  assert.equal(
    cadenceLine([
      { name: "woda", changedAt: at, cadence: "water" },
      { name: "pogoda", changedAt: at, cadence: "live" },
      { name: "prąd", changedAt: at, cadence: "live" },
    ]),
    `Sprawdzamy co ${live.every}: pogoda, prąd; co ${water.every}: woda.`,
  );
  // A source not in the freshness line: not here either.
  assert.equal(
    cadenceLine([
      { name: "woda", changedAt: null, cadence: "water" },
      { name: "pogoda", changedAt: at, cadence: "live" },
    ]),
    `Sprawdzamy co ${live.every}.`,
  );
  assert.equal(cadenceLine([]), null);
});
