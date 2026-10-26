import assert from "node:assert/strict";
import { test } from "node:test";
import { wasteCalendarName, wasteFilename } from "./waste-ics.ts";

// The production zone names (zones.name), one per waste calendar.
const ZONES = [1, 2, 3, 4, 5].flatMap((s) => [
  `Gmina Lubaczów, sektor ${s}`,
  `Miasto Lubaczów, sektor ${s}`,
]);

test("the file is named after the calendar, not the zone id", () => {
  assert.equal(
    wasteCalendarName("Gmina Lubaczów, sektor 1"),
    "Wywóz śmieci – Gmina Lubaczów, sektor 1",
  );
  assert.equal(
    wasteFilename("Gmina Lubaczów, sektor 1"),
    "wywoz-smieci-gmina-lubaczow-sektor-1.ics",
  );
  assert.equal(
    wasteFilename("Miasto Lubaczów, sektor 3"),
    "wywoz-smieci-miasto-lubaczow-sektor-3.ics",
  );
  assert.equal(
    wasteFilename("Krowica Sama, sektor 2"),
    "wywoz-smieci-krowica-sama-sektor-2.ics",
  );
});

test("every waste file name is plain ASCII, ≤ 80 chars, without 'waste'", () => {
  const long = "Lisie Jamy, Dąbrowa, Szczutków, Młodów, Załuże i Krowica Sama";
  for (const zone of [...ZONES, long, `${long}, ${long}`]) {
    const name = wasteFilename(zone);
    assert.match(name, /^[a-z0-9]+(-[a-z0-9]+)*\.ics$/, name);
    assert.ok(name.length - ".ics".length <= 80, name);
    assert.doesNotMatch(name, /waste/, name);
  }
});
