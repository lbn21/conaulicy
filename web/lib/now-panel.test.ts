import assert from "node:assert/strict";
import { test } from "node:test";
import { warsawToIso } from "./dates.ts";
import type { Disruption } from "./disruptions.ts";
import type { ShownWarning } from "./imgw-shown.ts";
import {
  counted,
  powerInWindow,
  topWarning,
  waterInWindow,
} from "./now-panel.ts";
import type { PgeOutage } from "./pge-feed.ts";
import { inWindow, onDay } from "./timeline.ts";
import { cutSpan } from "./water-module.ts";
import { days, windowOf } from "./window.ts";

// The home page's „Teraz w gminie” aggregates (lib/now-panel.ts): Polish
// counts, and each module's gmina-wide count for the site's 7-day window
// (lib/window.ts) by the timeline's rule (lib/timeline.ts inWindow), here
// from a Saturday morning: 14 to 20 November.

const RANGE = windowOf("2026-11-14");
/** Saturday 14 November, 10:00 in Warsaw. */
const NOW = Date.parse(warsawToIso("2026-11-14 10:00:00") as string);

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

/** A cut on `date`, from `from` to `to` (Warsaw wall clock). */
const at = (date: string, from = "08:00", to = "12:00") => ({
  date,
  start: `${date} ${from}:00`,
  end: `${date} ${to}:00`,
});

test("water: planned cuts shown in the window, one per post, day and hours", () => {
  const checked = () => "2026-11-12T10:00:00Z";
  assert.equal(waterInWindow([], RANGE, NOW, checked), 0);
  const cuts = [
    // The next Monday, over the weekend.
    cut({ uid: "a" }),
    // The same post, day and hours on another street: the same cut.
    cut({ uid: "b" }),
    // The next Thursday.
    cut({ uid: "c", ...at("2026-11-19") }),
    // Today, still on at 10:00.
    cut({ uid: "h", ...at("2026-11-14", "09:00") }),
    // Not counted: over at 10:00 today, an emergency, yesterday, a week
    // on, no source.
    cut({ uid: "i", ...at("2026-11-14", "06:00", "08:00") }),
    cut({ uid: "d", cause: "emergency" }),
    cut({ uid: "e", ...at("2026-11-13") }),
    cut({ uid: "f", ...at("2026-11-21") }),
    cut({ uid: "g", source: { url: "" } as Disruption["source"] }),
  ];
  assert.equal(waterInWindow(cuts, RANGE, NOW, checked), 3);
  // No check time: no source, no display.
  assert.equal(
    waterInWindow(cuts, RANGE, NOW, () => null),
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
  assert.equal(powerInWindow(feed([]), RANGE, NOW), 0);
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
        // Over at 10:00 today.
        outage({
          uuid: "f",
          ranges: [
            {
              start: "2026-11-14T06:00:00+01:00",
              end: "2026-11-14T08:00:00+01:00",
            },
          ],
        }),
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
      NOW,
    ),
    2,
  );
});

// The address page's counts are its timeline's (components/hub.tsx,
// lib/timeline.ts onDay): the panel's, on the same cuts, agree.
test("the panel's counts agree with the timeline's for the same window", () => {
  const checked = () => "2026-11-14T08:00:00Z";
  const cuts = [
    ["2026-11-14", "06:00", "08:00"],
    ["2026-11-14", "09:00", "12:00"],
    ["2026-11-16", "08:00", "12:00"],
    ["2026-11-20", "22:00", "23:30"],
    ["2026-11-21", "08:00", "12:00"],
  ].map(([date, from, to], i) =>
    cut({
      uid: `w${i}`,
      ...at(date, from, to),
      source: { url: `https://example.org/post-${i}` } as Disruption["source"],
    }),
  );
  const items = cuts.map((d) => ({
    module: "woda" as const,
    span: cutSpan(d),
    emergency: false,
    second: null,
  }));
  const timeline = new Set(
    days(RANGE.from).flatMap((day) =>
      onDay(items, day, NOW).map((e) => e.item),
    ),
  );
  assert.equal(timeline.size, 3);
  assert.equal(waterInWindow(cuts, RANGE, NOW, checked), timeline.size);
  assert.equal(
    items.filter((item) => inWindow(item.span, RANGE, NOW)).length,
    timeline.size,
  );
  const outages = cuts.map((d, i) =>
    outage({
      uuid: `p${i}`,
      ranges: [
        {
          start: warsawToIso(d.start as string) as string,
          end: warsawToIso(d.end as string) as string,
        },
      ],
    }),
  );
  assert.equal(
    powerInWindow({ fetchedAt: "", items: outages }, RANGE, NOW),
    timeline.size,
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
