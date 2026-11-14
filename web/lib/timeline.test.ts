import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dayLead,
  dayRange,
  dayWithYear,
  relativeDay,
  todayInWarsaw,
  warsawToIso,
} from "./dates.ts";
import { span } from "./hub.ts";
import { collapse, type Entry, later, onDay } from "./timeline.ts";
import type { Item } from "./upcoming.ts";
import { days } from "./window.ts";

// The address page's timeline (lib/timeline.ts) and its dates' words
// (lib/dates.ts), at fixed Warsaw days and instants. Intl's spaces around
// a range's dash may be thin or no-break ones: compared as plain spaces.
const at = (iso: string) => Date.parse(iso);
const wall = (w: string, pick?: "earlier" | "later") =>
  warsawToIso(w, pick) as string;
const plain = (text: string) => text.replace(/\s/g, " ");

const cut = (day: string, start: string, end: string): Item => ({
  module: "woda",
  span: span(day, wall(start), wall(end, "later")),
  emergency: false,
  second: "Cała wieś Wzorowo.",
});

const pickup = (day: string): Item => ({
  module: "smieci",
  span: span(day, null, null),
  bins: "papier, szkło",
  pickups: [],
  second: null,
});

/** Each group as "from..to: n". */
const shape = (list: string[], byDay: Entry[][]) =>
  collapse(list, byDay).map(
    ({ from, to, entries }) =>
      `${from === to ? from : `${from}..${to}`}: ${entries.length}`,
  );

const E: Entry[] = [];
const ONE: Entry[] = [{ item: pickup("2026-11-10"), continued: false }];

test("collapse: 2+ empty days one card, today included; one empty day its own", () => {
  const list = days("2026-11-10", 7);
  // A single empty day between two busy ones stays its own.
  assert.deepEqual(shape(list, [ONE, E, ONE, E, E, ONE, E]), [
    "2026-11-10: 1",
    "2026-11-11: 0",
    "2026-11-12: 1",
    "2026-11-13..2026-11-14: 0",
    "2026-11-15: 1",
    "2026-11-16: 0",
  ]);
  // A run including today folds into one card.
  assert.deepEqual(shape(list, [E, E, E, ONE, ONE, ONE, ONE]), [
    "2026-11-10..2026-11-12: 0",
    "2026-11-13: 1",
    "2026-11-14: 1",
    "2026-11-15: 1",
    "2026-11-16: 1",
  ]);
  // A single empty today before a busy tomorrow stays its own.
  assert.deepEqual(shape(list, [E, ONE, ONE, ONE, ONE, ONE, ONE]).slice(0, 2), [
    "2026-11-10: 0",
    "2026-11-11: 1",
  ]);
  assert.deepEqual(shape([], []), []);
});

test("collapse: a run ends the day before the next item, the window's last day included", () => {
  // conaulicy.pl/adres/0972447-19253 on 10 Nov: a pickup on the 16th, the
  // window's last day, so the run is 10–15 and the 16th its own card.
  const now = Date.parse("2026-11-10T20:00:00Z");
  const list = days("2026-11-10", 7);
  const items = [pickup("2026-11-16"), pickup("2026-11-30")];
  assert.deepEqual(
    shape(
      list,
      list.map((day) => onDay(items, day, now)),
    ),
    ["2026-11-10..2026-11-15: 0", "2026-11-16: 1"],
  );
  // Waste is in the window: no „Później” for it.
  assert.deepEqual(
    later(
      items,
      list[list.length - 1],
      list.map((day) => onDay(items, day, now)),
    ),
    [],
  );
});

test("collapse: all 7 days empty is one range, then „Później”", () => {
  const now = Date.parse("2026-11-10T20:00:00Z");
  const list = days("2026-11-10", 7);
  const items = [pickup("2026-11-30")];
  assert.deepEqual(
    shape(
      list,
      list.map((day) => onDay(items, day, now)),
    ),
    ["2026-11-10..2026-11-16: 0"],
  );
  assert.deepEqual(
    later(
      items,
      list[list.length - 1],
      list.map(() => []),
    ),
    items,
  );
});

test("onDay: registry order, then start; a multi-day item on each day, „continued” after its first", () => {
  const night = cut("2026-11-10", "2026-11-10 22:00:00", "2026-11-11 04:00:00");
  const bins = pickup("2026-11-10");
  const early = cut("2026-11-10", "2026-11-10 07:00:00", "2026-11-10 09:00:00");
  const items = [night, bins, early];
  const now = at("2026-11-10T06:00:00+01:00");
  assert.deepEqual(onDay(items, "2026-11-10", now), [
    { item: bins, continued: false },
    { item: early, continued: false },
    { item: night, continued: false },
  ]);
  assert.deepEqual(onDay(items, "2026-11-11", now), [
    { item: night, continued: true },
  ]);
  assert.deepEqual(onDay(items, "2026-11-12", now), []);
});

test("onDay: an item over at `now` is gone, from today too", () => {
  const morning = cut(
    "2026-11-10",
    "2026-11-10 08:00:00",
    "2026-11-10 12:00:00",
  );
  const bins = pickup("2026-11-10");
  const list = (now: string) =>
    onDay([morning, bins], "2026-11-10", at(now)).map((e) => e.item.module);
  assert.deepEqual(list("2026-11-10T11:59:59+01:00"), ["smieci", "woda"]);
  assert.deepEqual(list("2026-11-10T12:00:00+01:00"), ["smieci"]);
  // A pickup without a time stays until the Warsaw midnight after its day.
  assert.deepEqual(list("2026-11-10T23:59:59+01:00"), ["smieci"]);
  assert.deepEqual(list("2026-11-11T00:00:00+01:00"), []);
});

test("onDay: Warsaw days across the DST change (25 Oct 2026, 25 hours)", () => {
  // 23:30 on the 25-hour day is still that day.
  const late = cut("2026-10-25", "2026-10-25 23:00:00", "2026-10-25 23:30:00");
  const now = at("2026-10-25T00:00:00+02:00");
  assert.equal(onDay([late], "2026-10-25", now).length, 1);
  assert.equal(onDay([late], "2026-10-24", now).length, 0);
  assert.equal(onDay([late], "2026-10-26", now).length, 0);
});

/** later() for the 7 days from 10 Nov 2026, read on its evening. */
const laterOf = (items: Item[]) => {
  const now = Date.parse("2026-11-10T20:00:00Z");
  const list = days("2026-11-10", 7);
  return later(
    items,
    list[list.length - 1],
    list.map((day) => onDay(items, day, now)),
  ).map((item) => [item.module, item.span.day]);
};

test("later: the first item after the window per module, in registry order", () => {
  const items = [
    cut("2026-11-18", "2026-11-18 08:00:00", "2026-11-18 12:00:00"),
    cut("2026-11-17", "2026-11-17 08:00:00", "2026-11-17 12:00:00"),
    pickup("2026-11-30"),
    pickup("2026-11-24"),
  ];
  assert.deepEqual(laterOf(items), [
    ["smieci", "2026-11-24"],
    ["woda", "2026-11-17"],
  ]);
  assert.deepEqual(
    later(
      items,
      "2026-11-30",
      days("2026-11-24", 7).map(() => []),
    ),
    [],
  );
});

test("later: every module in the window, so none", () => {
  assert.deepEqual(
    laterOf([
      pickup("2026-11-12"),
      pickup("2026-11-24"),
      cut("2026-11-16", "2026-11-16 08:00:00", "2026-11-16 12:00:00"),
      cut("2026-11-20", "2026-11-20 08:00:00", "2026-11-20 12:00:00"),
    ]),
    [],
  );
});

test("later: only the module missing from the window", () => {
  assert.deepEqual(
    laterOf([
      pickup("2026-11-12"),
      pickup("2026-11-24"),
      cut("2026-11-20", "2026-11-20 08:00:00", "2026-11-20 12:00:00"),
    ]),
    [["woda", "2026-11-20"]],
  );
  // A cut begun before the window and still on is in it.
  const now = at("2026-11-10T09:00:00+01:00");
  const list = days("2026-11-10", 7);
  const items = [
    cut("2026-11-09", "2026-11-09 22:00:00", "2026-11-10 12:00:00"),
    cut("2026-11-20", "2026-11-20 08:00:00", "2026-11-20 12:00:00"),
  ];
  assert.deepEqual(
    later(
      items,
      list[list.length - 1],
      list.map((day) => onDay(items, day, now)),
    ),
    [],
  );
});

test("later: a module with nothing, in or after the window, is absent", () => {
  assert.deepEqual(laterOf([pickup("2026-11-24")]), [["smieci", "2026-11-24"]]);
  assert.deepEqual(laterOf([]), []);
});

test("range titles: Intl's formatRange, the month once, years only when they differ", () => {
  assert.equal(plain(dayRange("2026-11-11", "2026-11-15")), "11–15 listopada");
  assert.equal(
    plain(dayRange("2026-11-29", "2026-12-02")),
    "29 listopada – 2 grudnia",
  );
  assert.equal(
    plain(dayRange("2026-12-29", "2027-01-02")),
    "29 grudnia 2026 – 2 stycznia 2027",
  );
});

test("„Później”: the day with its weekday and year", () => {
  assert.equal(dayWithYear("2026-11-30"), "poniedziałek, 30 listopada 2026");
  assert.equal(dayWithYear("2027-01-04"), "poniedziałek, 4 stycznia 2027");
});

test("relative words: Intl's, by Warsaw days", () => {
  assert.deepEqual(
    [
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-16",
    ].map((day) => relativeDay(day, "2026-11-10")),
    ["wczoraj", "dzisiaj", "jutro", "pojutrze", "za 3 dni", "za 6 dni"],
  );
  // Across the DST change and the turn of the year.
  assert.equal(relativeDay("2026-10-26", "2026-10-25"), "jutro");
  assert.equal(relativeDay("2027-01-01", "2026-12-31"), "jutro");
});

test("section day lead: „Dziś”, „Jutro”, „Za N dni” for 2 to 7 days, else none", () => {
  const lead = (day: string) => dayLead(day, "x", "2026-10-28");
  assert.deepEqual(
    [
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-11-04",
      "2026-11-05",
    ].map(lead),
    ["X", "Dziś: x", "Jutro: x", "Za 2 dni: x", "Za 7 dni: x", "X"],
  );
  // Across midnight and the DST change, by Warsaw days.
  assert.equal(
    dayLead(
      "2026-10-26",
      "poniedziałek",
      todayInWarsaw(new Date(at("2026-10-24T23:30:00Z"))),
    ),
    "Jutro: poniedziałek",
  );
});
