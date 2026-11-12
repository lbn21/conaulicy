import assert from "node:assert/strict";
import { test } from "node:test";
import type { Disruption } from "./disruptions.ts";
import type { ShownWarning } from "./imgw-shown.ts";
import {
  counted,
  powerWeek,
  topWarning,
  waterWeek,
  weekOf,
} from "./now-panel.ts";
import type { PgeOutage } from "./pge-feed.ts";

// The home page's „Teraz w gminie” aggregates (lib/now-panel.ts): the
// week, Polish counts, and each module's gmina-wide count for the week.

const WEEK = weekOf("2026-11-12"); // a Thursday

test("the week: Monday to Sunday of the day, and the next Monday", () => {
  assert.deepEqual(WEEK, {
    from: "2026-11-09",
    to: "2026-11-15",
    until: "2026-11-16",
  });
  assert.equal(weekOf("2026-11-09").from, "2026-11-09");
  assert.equal(weekOf("2026-11-15").from, "2026-11-09");
  // Across a month and a year.
  assert.equal(weekOf("2027-01-01").from, "2026-12-28");
});

test("counted: Polish plural forms", () => {
  const forms: [string, string, string] = ["a", "b", "c"];
  assert.deepEqual(
    [1, 2, 4, 5, 12, 22, 25].map((n) => counted(n, forms)),
    ["1 a", "2 b", "4 b", "5 c", "12 c", "22 b", "25 c"],
  );
});

const cut = (over: Partial<Disruption>): Disruption =>
  ({
    uid: "x",
    kind: "water",
    cause: "planned",
    date: "2026-11-10",
    start: "2026-11-10 08:00:00",
    end: "2026-11-10 12:00:00",
    source: { url: "https://example.org/post-1" },
    ...over,
  }) as Disruption;

test("water: planned cuts starting this week, one per post, day and hours", () => {
  const checked = () => "2026-11-12T10:00:00Z";
  assert.equal(waterWeek([], WEEK, checked), 0);
  const cuts = [
    cut({ uid: "a" }),
    // The same post, day and hours on another street: the same cut.
    cut({ uid: "b" }),
    cut({ uid: "c", date: "2026-11-14", start: "2026-11-14 08:00:00" }),
    // Not counted: an emergency, last week, next week, no source.
    cut({ uid: "d", cause: "emergency" }),
    cut({ uid: "e", date: "2026-11-08" }),
    cut({ uid: "f", date: "2026-11-16" }),
    cut({ uid: "g", source: { url: "" } as Disruption["source"] }),
  ];
  assert.equal(waterWeek(cuts, WEEK, checked), 2);
  // No check time: no source, no display.
  assert.equal(
    waterWeek(cuts, WEEK, () => null),
    0,
  );
});

const outage = (over: Partial<PgeOutage>): PgeOutage => ({
  uuid: "u",
  kind: "planned",
  revoked: false,
  revokedNote: null,
  ranges: [
    { start: "2026-11-13T08:00:00+01:00", end: "2026-11-13T14:00:00+01:00" },
  ],
  addresses: [],
  updatedAt: null,
  ...over,
});

test("power: planned, not revoked, with a range in the week", () => {
  const feed = (items: PgeOutage[]) => ({ fetchedAt: "", items });
  assert.equal(powerWeek(feed([]), WEEK), 0);
  assert.equal(
    powerWeek(
      feed([
        outage({ uuid: "a" }),
        // Over the weekend into Monday: still this week.
        outage({
          uuid: "b",
          ranges: [
            {
              start: "2026-11-15T22:00:00+01:00",
              end: "2026-11-16T02:00:00+01:00",
            },
          ],
        }),
        outage({ uuid: "c", kind: "failure" }),
        outage({ uuid: "d", revoked: true }),
        outage({
          uuid: "e",
          ranges: [
            {
              start: "2026-11-17T08:00:00+01:00",
              end: "2026-11-17T12:00:00+01:00",
            },
          ],
        }),
      ]),
      WEEK,
    ),
    2,
  );
});

test("weather: the highest level first, then the earliest", () => {
  const w = (id: string, level: 1 | 2 | 3, from: string) =>
    ({ id, level, from, to: from, event: id }) as ShownWarning;
  assert.equal(topWarning([]), null);
  assert.equal(
    topWarning([
      w("a", 1, "2026-11-12T08:00:00Z"),
      w("b", 2, "2026-11-13T08:00:00Z"),
      w("c", 2, "2026-11-12T20:00:00Z"),
    ])?.id,
    "c",
  );
});
