import assert from "node:assert/strict";
import { test } from "node:test";
import { checkedLine, freshnessLine, sourceLine } from "./hub.ts";

/** The check line, its no-break spaces as spaces (asserted below). */
const checked = (at: Parameters<typeof checkedLine>[0]) =>
  checkedLine(at)?.replaceAll("\u00a0", " ") ?? null;

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

test("source line: sources joined; the check its own line, unbroken", () => {
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
  // The check is its own line, its day and time never broken (t373).
  assert.equal(
    checkedLine(new Date("2026-10-28T14:52:00Z")),
    "Sprawdziliśmy 28\u00a0października\u00a015:52.",
  );
  assert.deepEqual(sourceLine([]), []);
});

test("freshness line: each module with a known check, in order, as a Polish list", () => {
  assert.equal(
    freshnessLine([
      { name: "śmieci", at: new Date("2026-11-10T21:40:00Z") },
      { name: "woda", at: new Date("2026-11-11T06:00:00Z") },
      { name: "pogoda", at: new Date("2026-11-11T06:07:00Z") },
    ]),
    "Sprawdziliśmy 10\u00a0listopada: śmieci\u00a022:40; 11\u00a0listopada: woda\u00a07:00 i pogoda\u00a07:07.",
  );
  assert.equal(
    freshnessLine([
      { name: "śmieci", at: "2026-10-23" },
      { name: "woda", at: null },
      { name: "pogoda", at: new Date("2026-11-11T06:07:00Z") },
    ]),
    "Sprawdziliśmy 23\u00a0października: śmieci; 11\u00a0listopada: pogoda\u00a07:07.",
  );
  assert.equal(freshnessLine([{ name: "woda", at: null }]), null);
});
