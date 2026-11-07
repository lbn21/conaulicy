import assert from "node:assert/strict";
import { test } from "node:test";
import {
  absoluteDay,
  addDays,
  capitalised,
  dayLead,
  relativeWord,
  todayInWarsaw,
  warsawToIso,
} from "./dates.ts";
import { span } from "./hub.ts";
import {
  cardWords,
  type Item,
  ordered,
  timeline,
  WINDOW_DAYS,
} from "./upcoming.ts";

// Wednesday 28 Oct 2026; Warsaw is UTC+1 (CET since Sunday's 3:00).
const at = (iso: string) => Date.parse(iso);
const wall = (w: string, pick?: "earlier" | "later") =>
  warsawToIso(w, pick) as string;

const cut = (
  day: string,
  start: string | null,
  end: string | null,
  over: Partial<Extract<Item, { module: "woda" }>> = {},
): Item => ({
  module: "woda",
  span: span(day, start && wall(start), end && wall(end, "later")),
  shownFrom: null,
  emergency: false,
  second: "Cała wieś Wzorowo.",
  secondUntil: null,
  ...over,
});

const LEVEL = { tag: "govuk-tag govuk-tag--yellow", text: "Stopień 1 z 3" };
const warning = (from: string, to: string): Item => ({
  module: "pogoda",
  span: span(from.slice(0, 10), wall(from), wall(to)),
  shownFrom: null,
  event: "silny wiatr",
  level: LEVEL,
  second: "Cały powiat.",
  secondUntil: null,
});

const pickup = (day: string, bins = "papier, szkło"): Item => ({
  module: "smieci",
  span: span(day, null, null),
  // From the day it enters the window, as wasteUpcoming.
  shownFrom: wall(`${addDays(day, 1 - WINDOW_DAYS)} 00:00:00`),
  bins,
  second: "Wystaw je do 6:00 rano.",
  secondUntil: wall(`${day} 06:00:00`),
});

/**
 * An item as the timeline shows it at `now`, as one line of text: its
 * day's heading as the device puts it (components/timeline-day.tsx),
 * then its card (its hours, what happens, the tag's text in [ ]), joined
 * by „ · ”, the second sentence after |; null when not shown.
 */
const said = (item: Item, now: number) => {
  const { week, later } = timeline([item], now);
  const row = [...week, ...later].find(
    (r) => r.kind === "day" && r.items.includes(item),
  );
  if (row?.kind !== "day") return null;
  const word = relativeWord(row.day, todayInWarsaw(new Date(now)));
  const lead = word ? capitalised(word) : capitalised(absoluteDay(row.day));
  const { when, text, second } = cardWords(item, row.day, now);
  const what = text
    .map((part) => (typeof part === "string" ? part : `[${part.text}]`))
    .join("");
  const line = [lead, when, what].filter(Boolean).join(" · ");
  return second ? `${line} | ${second}` : line;
};

const DAY = cut("2026-10-28", "2026-10-28 08:00:00", "2026-10-28 16:00:00");

test("water, one day: before, under way (the same absolute words), over", () => {
  for (const time of ["07:00", "08:00", "15:59"])
    assert.equal(
      said(DAY, at(`2026-10-28T${time}:00+01:00`)),
      "Dziś · Od 8:00 do 16:00 · Nie będzie wody. | Cała wieś Wzorowo.",
      time,
    );
  // Ended at 16:00: gone, though the day goes on.
  assert.equal(said(DAY, at("2026-10-28T16:00:00+01:00")), null);
});

test("water: tomorrow, later, an estimate, a failure", () => {
  const now = at("2026-10-27T20:00:00+01:00");
  assert.equal(
    said(DAY, now),
    "Jutro · Od 8:00 do 16:00 · Nie będzie wody. | Cała wieś Wzorowo.",
  );
  assert.equal(
    said(DAY, at("2026-10-26T20:00:00+01:00")),
    "Środa, 28 października · Od 8:00 do 16:00 · Nie będzie wody. | Cała wieś Wzorowo.",
  );
  const about = cut(
    "2026-10-28",
    "2026-10-28 08:00:00",
    "2026-10-28 16:00:00",
    {
      span: span(
        "2026-10-28",
        wall("2026-10-28 08:00:00"),
        wall("2026-10-28 16:00:00"),
        true,
      ),
      emergency: true,
    },
  );
  assert.equal(
    said(about, at("2026-10-28T09:00:00+01:00")),
    "Dziś · Od 8:00 do ok. 16:00 · Nie będzie wody (awaria). | Cała wieś Wzorowo.",
  );
});

test("water: a failure, one form on every day", () => {
  const failure = (start: string | null, end: string | null) =>
    cut("2026-10-30", start, end, { emergency: true, second: null });
  const now = at("2026-10-28T12:00:00+01:00");
  assert.equal(
    said(failure("2026-10-30 08:00:00", "2026-10-30 16:00:00"), now),
    "Piątek, 30 października · Od 8:00 do 16:00 · Nie będzie wody (awaria).",
  );
  // No hours: no „when” line.
  assert.equal(
    said(failure(null, null), now),
    "Piątek, 30 października · Będzie przerwa w dostawie wody (awaria). Komunikat nie podaje godzin.",
  );
  assert.equal(
    said(failure("2026-10-30 08:00:00", null), at("2026-10-30T09:00:00+01:00")),
    "Dziś · Od 8:00 · Nie będzie wody (awaria). Komunikat nie podaje, do której.",
  );
});

test("water: a night cut across midnight, on its start's day, then today's", () => {
  const night = cut("2026-10-28", "2026-10-28 22:00:00", "2026-10-29 04:00:00");
  // The end's day named, absolute.
  for (const time of ["20:00", "23:00"])
    assert.equal(
      said(night, at(`2026-10-28T${time}:00+01:00`)),
      "Dziś · Od 22:00 do czwartku 29 października, 4:00 · Nie będzie wody. | Cała wieś Wzorowo.",
      time,
    );
  // After midnight it began yesterday: under today, its start's day named,
  // the end's not (today's).
  assert.equal(
    said(night, at("2026-10-29T01:00:00+01:00")),
    "Dziś · Od środy 28 października, 22:00 do 4:00 · Nie będzie wody. | Cała wieś Wzorowo.",
  );
  assert.equal(said(night, at("2026-10-29T04:00:00+01:00")), null);
});

test("water: no end, no start, no times", () => {
  const open = cut("2026-10-28", "2026-10-28 08:00:00", null);
  assert.equal(
    said(open, at("2026-10-28T23:59:00+01:00")),
    "Dziś · Od 8:00 · Nie będzie wody. Komunikat nie podaje, do której. | Cała wieś Wzorowo.",
  );
  // Without an end: until the end of its day.
  assert.equal(said(open, at("2026-10-29T00:00:00+01:00")), null);
  const until = cut("2026-10-28", null, "2026-10-28 16:00:00");
  assert.equal(
    said(until, at("2026-10-28T11:00:00+01:00")),
    "Dziś · Do 16:00 · Nie będzie wody. | Cała wieś Wzorowo.",
  );
  const none = cut("2026-10-28", null, null);
  assert.equal(
    said(none, at("2026-10-27T11:00:00+01:00")),
    "Jutro · Będzie przerwa w dostawie wody. Komunikat nie podaje godzin. | Cała wieś Wzorowo.",
  );
});

test("the 25 Oct DST change: the repeated hour and a 25-hour day", () => {
  // 2:30 twice: the first in summer time (0:30 UTC), the second in winter
  // time (1:30 UTC).
  const twice = cut("2026-10-25", "2026-10-25 02:30:00", "2026-10-25 02:30:00");
  assert.equal(twice.span.start, "2026-10-25T02:30:00+02:00");
  assert.equal(twice.span.end, "2026-10-25T02:30:00+01:00");
  assert.equal(
    said(twice, at("2026-10-25T01:00:00Z")),
    "Dziś · Od 2:30 do 2:30 · Nie będzie wody. | Cała wieś Wzorowo.",
  );
  assert.equal(said(twice, at("2026-10-25T01:30:00Z")), null);
  // A pickup on the 25th lasts 25 hours: today until 23:59 CET.
  const sunday = pickup("2026-10-25");
  assert.equal(sunday.span.start, "2026-10-25T00:00:00+02:00");
  assert.equal(sunday.span.end, "2026-10-26T00:00:00+01:00");
  assert.equal(
    said(sunday, at("2026-10-25T22:59:00Z")),
    "Dziś · Odbiorą: papier, szkło.",
  );
  assert.equal(said(sunday, at("2026-10-25T23:00:00Z")), null);
});

test("IMGW: in force, tomorrow, later, over", () => {
  const wind = warning("2026-10-29 13:00:00", "2026-10-30 02:00:00");
  assert.equal(
    said(wind, at("2026-10-29T14:00:00+01:00")),
    "Dziś · Od 13:00 do piątku 30 października, 2:00 · Ostrzeżenie IMGW – silny wiatr [Stopień 1 z 3] | Cały powiat.",
  );
  assert.equal(
    said(wind, at("2026-10-28T14:00:00+01:00")),
    "Jutro · Od 13:00 do piątku 30 października, 2:00 · Ostrzeżenie IMGW – silny wiatr [Stopień 1 z 3] | Cały powiat.",
  );
  // In force past midnight: under today, from yesterday.
  assert.equal(
    said(wind, at("2026-10-30T01:00:00+01:00")),
    "Dziś · Od czwartku 29 października, 13:00 do 2:00 · Ostrzeżenie IMGW – silny wiatr [Stopień 1 z 3] | Cały powiat.",
  );
  const storm = warning("2026-10-31 13:00:00", "2026-10-31 19:00:00");
  assert.equal(
    said(storm, at("2026-10-28T14:00:00+01:00")),
    "Sobota, 31 października · Od 13:00 do 19:00 · Ostrzeżenie IMGW – silny wiatr [Stopień 1 z 3] | Cały powiat.",
  );
  assert.equal(said(storm, at("2026-10-31T19:00:00+01:00")), null);
});

test("IMGW without times: no „when” line, as the water's", () => {
  const bare: Item = {
    ...warning("2026-10-31 13:00:00", "2026-10-31 19:00:00"),
  };
  bare.span = { ...bare.span, from: null, to: null };
  assert.equal(
    said(bare, at("2026-10-30T12:00:00+01:00")),
    "Jutro · Ostrzeżenie IMGW – silny wiatr [Stopień 1 z 3] | Cały powiat.",
  );
});

test("pickups: every one in the window (task 261); put out until its time", () => {
  const friday = pickup("2026-10-30");
  // Seven days ahead (today + 7): not yet; six days ahead: in the window.
  assert.equal(said(friday, at("2026-10-23T12:00:00+02:00")), null);
  assert.equal(
    said(friday, at("2026-10-24T00:00:00+02:00")),
    "Piątek, 30 października · Odbiorą: papier, szkło. | Wystaw je do 6:00 rano.",
  );
  assert.equal(
    said(friday, at("2026-10-29T00:00:00+01:00")),
    "Jutro · Odbiorą: papier, szkło. | Wystaw je do 6:00 rano.",
  );
  assert.equal(
    said(friday, at("2026-10-30T06:00:00+01:00")),
    "Dziś · Odbiorą: papier, szkło.",
  );
  assert.equal(said(friday, at("2026-10-31T00:00:00+01:00")), null);
  assert.equal(
    said(
      pickup("2026-10-29", "wszystkie pojemniki"),
      at("2026-10-28T12:00:00+01:00"),
    ),
    "Jutro · Odbiorą: wszystkie pojemniki. | Wystaw je do 6:00 rano.",
  );
});

// The timeline's days at noon on Wednesday 28 Oct: today and the next six,
// to Tuesday 3 Nov.
const NOON = at("2026-10-28T12:00:00+01:00");
const shape = (items: Item[], now = NOON) => {
  const { week, later } = timeline(ordered(items), now);
  const row = (r: (typeof week)[number]) =>
    r.kind === "day"
      ? `${r.day}:${r.items.length}`
      : r.from === r.to
        ? `${r.from} empty`
        : `${r.from}..${r.to} empty`;
  return { week: week.map(row), later: later.map(row) };
};

test("timeline: nothing at all, one line for the whole week", () => {
  assert.deepEqual(shape([]), {
    week: ["2026-10-28..2026-11-03 empty"],
    later: [],
  });
});

test("timeline: days with items; one empty day its own line, a run one line", () => {
  const items = [
    pickup("2026-10-28"),
    cut("2026-10-28", "2026-10-28 13:00:00", "2026-10-28 15:00:00"),
    pickup("2026-10-30"),
    warning("2026-11-03 13:00:00", "2026-11-03 19:00:00"),
  ];
  assert.deepEqual(shape(items), {
    week: [
      "2026-10-28:2",
      "2026-10-29 empty",
      "2026-10-30:1",
      "2026-10-31..2026-11-02 empty",
      "2026-11-03:1",
    ],
    later: [],
  });
  // A day's items in the one order (start, then end, then the registry).
  const { week } = timeline(ordered(items), NOON);
  assert.equal(week[0].kind === "day" && week[0].items[0].module, "smieci");
});

test("timeline: today empty, a run from tomorrow to the end", () => {
  assert.deepEqual(shape([pickup("2026-10-29")]), {
    week: ["2026-10-28 empty", "2026-10-29:1", "2026-10-30..2026-11-03 empty"],
    later: [],
  });
});

test("timeline: an item past the window goes to „later”, no empty lines there", () => {
  const far = cut("2026-11-10", "2026-11-10 08:00:00", "2026-11-10 12:00:00");
  const farther = cut(
    "2026-11-12",
    "2026-11-12 08:00:00",
    "2026-11-12 12:00:00",
  );
  assert.deepEqual(shape([farther, far]), {
    week: ["2026-10-28..2026-11-03 empty"],
    later: ["2026-11-10:1", "2026-11-12:1"],
  });
});

test("timeline: an item under way since yesterday is today's, once", () => {
  // From Tuesday 22:00 to Thursday 4:00: on Wednesday it is today's alone,
  // never also on Thursday.
  const long = cut("2026-10-27", "2026-10-27 22:00:00", "2026-10-29 04:00:00");
  assert.deepEqual(shape([long]), {
    week: ["2026-10-28:1", "2026-10-29..2026-11-03 empty"],
    later: [],
  });
  // What is over is not shown, so its day is empty.
  assert.deepEqual(shape([DAY], at("2026-10-28T16:00:00+01:00")).week, [
    "2026-10-28..2026-11-03 empty",
  ]);
});

test("timeline: the window by Warsaw days, across the DST change", () => {
  // Late on Saturday 24 Oct (UTC, Warsaw still CEST): the window is 24-30 Oct.
  assert.deepEqual(shape([], at("2026-10-24T21:30:00Z")).week, [
    "2026-10-24..2026-10-30 empty",
  ]);
  // 22:30 UTC is Sunday 0:30 in Warsaw (CEST): 25-31 Oct.
  assert.deepEqual(shape([], at("2026-10-24T22:30:00Z")).week, [
    "2026-10-25..2026-10-31 empty",
  ]);
});

test("order: start, then end, then the registry; never the time", () => {
  const water = DAY;
  const weather = warning("2026-10-28 08:00:00", "2026-10-28 16:00:00");
  const sooner = cut(
    "2026-10-28",
    "2026-10-28 08:00:00",
    "2026-10-28 12:00:00",
  );
  const bins = pickup("2026-10-28");
  const night = warning("2026-10-27 22:00:00", "2026-10-28 02:00:00");
  const list = ordered([weather, water, bins, sooner, night]);
  assert.deepEqual(list, [night, bins, sooner, water, weather]);
  // Ties on start and end: MODULE_IDS (smieci, woda, pogoda).
  const same = { ...water, span: bins.span };
  const sameWeather = { ...weather, span: bins.span };
  assert.deepEqual(ordered([sameWeather, same, bins]), [
    bins,
    same,
    sameWeather,
  ]);
  assert.deepEqual(ordered([]), []);
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
