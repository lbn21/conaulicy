// Readers for the calendar files lib/ics.ts writes, for the tests of the
// waste and water calendars (lib/waste-ics.test.ts, lib/water-ics.test.ts).
// Test-only.
import assert from "node:assert/strict";

/** The file unfolded, one property per line. */
export const lines = (ics: string) => ics.replace(/\r\n /g, "").split("\r\n");

/** Every line folded to 75 octets. */
export const folded = (ics: string) => {
  for (const line of ics.split("\r\n"))
    assert.ok(new TextEncoder().encode(line).length <= 75, line);
};

export const events = (ics: string) => ics.split("BEGIN:VEVENT").length - 1;

/** Every value of a property, its parameters dropped. */
export const value = (ics: string, name: string) =>
  lines(ics)
    .filter(
      (line) => line.startsWith(`${name}:`) || line.startsWith(`${name};`),
    )
    .map((line) => line.slice(line.indexOf(":") + 1));
