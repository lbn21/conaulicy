import assert from "node:assert/strict";
import { test } from "node:test";
import type { Disruption } from "./disruptions.ts";
import type { ShownWarning } from "./imgw-shown.ts";
import {
  counted,
  powerInWindow,
  topWarning,
  waterInWindow,
} from "./now-panel.ts";
import type { PgeOutage } from "./pge-feed.ts";
import { windowOf } from "./window.ts";

// The home page's „Teraz w gminie” aggregates (lib/now-panel.ts): Polish
// counts, and each module's gmina-wide count for the site's 7-day window
// (lib/window.ts), here from a Saturday: 14 to 20 November.

const RANGE = windowOf("2026-11-14");

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
    date: "2026-11-16",
    start: "2026-11-16 08:00:00",
    end: "2026-11-16 12:00:00",
    source: { url: "https://example.org/post-1" },
    ...over,
  }) as Disruption;

test("water: planned cuts starting in the window, one per post, day and hours", () => {
  const checked = () => "2026-11-12T10:00:00Z";
  assert.equal(waterInWindow([], RANGE, checked), 0);
  const cuts = [
    // The next Monday, over the weekend.
    cut({ uid: "a" }),
    // The same post, day and hours on another street: the same cut.
    cut({ uid: "b" }),
    // The next Thursday.
    cut({ uid: "c", date: "2026-11-19", start: "2026-11-19 08:00:00" }),
    // Not counted: an emergency, yesterday, a week on, no source.
    cut({ uid: "d", cause: "emergency" }),
    cut({ uid: "e", date: "2026-11-13" }),
    cut({ uid: "f", date: "2026-11-21" }),
    cut({ uid: "g", source: { url: "" } as Disruption["source"] }),
  ];
  assert.equal(waterInWindow(cuts, RANGE, checked), 2);
  // No check time: no source, no display.
  assert.equal(
    waterInWindow(cuts, RANGE, () => null),
    0,
  );
});

const outage = (over: Partial<PgeOutage>): PgeOutage => ({
  uuid: "u",
  kind: "planned",
  revoked: false,
  revokedNote: null,
  ranges: [
    { start: "2026-11-17T08:00:00+01:00", end: "2026-11-17T14:00:00+01:00" },
  ],
  addresses: [],
  updatedAt: null,
  ...over,
});

test("power: planned, not revoked, with a range in the window", () => {
  const feed = (items: PgeOutage[]) => ({ fetchedAt: "", items });
  assert.equal(powerInWindow(feed([]), RANGE), 0);
  assert.equal(
    powerInWindow(
      feed([
        outage({ uuid: "a" }),
        // From the window's last evening into the day after: still in it.
        outage({
          uuid: "b",
          ranges: [
            {
              start: "2026-11-20T22:00:00+01:00",
              end: "2026-11-21T02:00:00+01:00",
            },
          ],
        }),
        outage({ uuid: "c", kind: "failure" }),
        outage({ uuid: "d", revoked: true }),
        outage({
          uuid: "e",
          ranges: [
            {
              start: "2026-11-21T08:00:00+01:00",
              end: "2026-11-21T12:00:00+01:00",
            },
          ],
        }),
      ]),
      RANGE,
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
