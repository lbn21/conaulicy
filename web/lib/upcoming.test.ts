import assert from "node:assert/strict";
import { test } from "node:test";
import { warsawToIso } from "./dates.ts";
import { span } from "./hub.ts";
import {
  dayLead,
  type Item,
  ordered,
  trusted,
  visible,
  type Words,
  words,
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
  // The day before, as wasteUpcoming.
  shownFrom: wall(
    `${new Date(Date.parse(day) - 86_400_000).toISOString().slice(0, 10)} 00:00:00`,
  ),
  bins,
  second: "Wystaw je do 6:00 rano.",
  secondUntil: wall(`${day} 06:00:00`),
});

/** The words as one line of text, the tag's text in [ ]. */
const said = (item: Item, now: number) => {
  if (!visible(item, now)) return null;
  const w: Words = words(item, now);
  const text = w.text
    .map((part) => (typeof part === "string" ? part : `[${part.text}]`))
    .join("");
  return `${w.lead} ${text}${w.second ? ` | ${w.second}` : ""}`;
};

const DAY = cut("2026-10-28", "2026-10-28 08:00:00", "2026-10-28 16:00:00");

test("water, one day: before, under way, over", () => {
  assert.equal(
    said(DAY, at("2026-10-28T07:00:00+01:00")),
    "Dziś od 8:00 do 16:00 nie będzie wody. | Cała wieś Wzorowo.",
  );
  assert.equal(
    said(DAY, at("2026-10-28T08:00:00+01:00")),
    "Teraz nie ma wody – do 16:00. | Cała wieś Wzorowo.",
  );
  assert.equal(
    said(DAY, at("2026-10-28T15:59:00+01:00"))?.slice(0, 5),
    "Teraz",
  );
  // Ended at 16:00: gone, though the day goes on.
  assert.equal(said(DAY, at("2026-10-28T16:00:00+01:00")), null);
});

test("water: tomorrow, later, an estimate, a failure", () => {
  const now = at("2026-10-27T20:00:00+01:00");
  assert.equal(
    said(DAY, now),
    "Jutro od 8:00 do 16:00 nie będzie wody. | Cała wieś Wzorowo.",
  );
  assert.equal(
    said(DAY, at("2026-10-26T20:00:00+01:00")),
    "Środa, 28 października: od 8:00 do 16:00 nie będzie wody. | Cała wieś Wzorowo.",
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
    "Teraz nie ma wody (awaria) – do ok. 16:00. | Cała wieś Wzorowo.",
  );
  assert.equal(
    said(about, now),
    "Jutro od 8:00 do ok. 16:00 nie będzie wody (awaria). | Cała wieś Wzorowo.",
  );
});

test("water: a failure, one form for every lead", () => {
  const failure = (start: string | null, end: string | null) =>
    cut("2026-10-30", start, end, { emergency: true, second: null });
  const now = at("2026-10-28T12:00:00+01:00");
  assert.equal(
    said(failure("2026-10-30 08:00:00", "2026-10-30 16:00:00"), now),
    "Piątek, 30 października: od 8:00 do 16:00 nie będzie wody (awaria).",
  );
  assert.equal(
    said(failure(null, null), now),
    "Piątek, 30 października: będzie przerwa w dostawie wody (awaria). Komunikat nie podaje godzin.",
  );
  assert.equal(
    said(failure("2026-10-30 08:00:00", null), at("2026-10-30T09:00:00+01:00")),
    "Teraz nie ma wody (awaria). Komunikat nie podaje, do której.",
  );
});

test("water: a night cut across midnight", () => {
  const night = cut("2026-10-28", "2026-10-28 22:00:00", "2026-10-29 04:00:00");
  assert.equal(
    said(night, at("2026-10-28T20:00:00+01:00")),
    "Dziś od 22:00 do jutra, 4:00 nie będzie wody. | Cała wieś Wzorowo.",
  );
  assert.equal(
    said(night, at("2026-10-28T23:00:00+01:00")),
    "Teraz nie ma wody – do jutra, 4:00. | Cała wieś Wzorowo.",
  );
  // After midnight its end is today.
  assert.equal(
    said(night, at("2026-10-29T01:00:00+01:00")),
    "Teraz nie ma wody – do 4:00. | Cała wieś Wzorowo.",
  );
  assert.equal(said(night, at("2026-10-29T04:00:00+01:00")), null);
  // Two days ahead, the end's day is named.
  assert.equal(
    said(night, at("2026-10-26T12:00:00+01:00")),
    "Środa, 28 października: od 22:00 do czwartku 29 października, 4:00 nie będzie wody. | Cała wieś Wzorowo.",
  );
});

test("water: no end, no start, no times", () => {
  const open = cut("2026-10-28", "2026-10-28 08:00:00", null);
  assert.equal(
    said(open, at("2026-10-28T07:00:00+01:00")),
    "Dziś od 8:00 nie będzie wody. Komunikat nie podaje, do której. | Cała wieś Wzorowo.",
  );
  assert.equal(
    said(open, at("2026-10-28T23:59:00+01:00")),
    "Teraz nie ma wody. Komunikat nie podaje, do której. | Cała wieś Wzorowo.",
  );
  // Without an end: until the end of its day.
  assert.equal(said(open, at("2026-10-29T00:00:00+01:00")), null);
  // Without a start it is never „Teraz”: we do not know it began.
  const until = cut("2026-10-28", null, "2026-10-28 16:00:00");
  assert.equal(
    said(until, at("2026-10-28T11:00:00+01:00")),
    "Dziś do 16:00 nie będzie wody. | Cała wieś Wzorowo.",
  );
  const none = cut("2026-10-28", null, null);
  assert.equal(
    said(none, at("2026-10-27T11:00:00+01:00")),
    "Jutro będzie przerwa w dostawie wody. Komunikat nie podaje godzin. | Cała wieś Wzorowo.",
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
    "Teraz nie ma wody – do 2:30. | Cała wieś Wzorowo.",
  );
  assert.equal(said(twice, at("2026-10-25T01:30:00Z")), null);
  // A pickup on the 25th lasts 25 hours: today until 23:59 CET.
  const sunday = pickup("2026-10-25");
  assert.equal(sunday.span.start, "2026-10-25T00:00:00+02:00");
  assert.equal(sunday.span.end, "2026-10-26T00:00:00+01:00");
  assert.equal(
    said(sunday, at("2026-10-25T22:59:00Z")),
    "Dziś odbiór śmieci: papier, szkło.",
  );
  assert.equal(said(sunday, at("2026-10-25T23:00:00Z")), null);
});

test("IMGW: in force, tomorrow, later, over", () => {
  const wind = warning("2026-10-29 13:00:00", "2026-10-30 02:00:00");
  assert.equal(
    said(wind, at("2026-10-29T14:00:00+01:00")),
    "Teraz: ostrzeżenie IMGW – silny wiatr [Stopień 1 z 3], do jutra, 2:00. | Cały powiat.",
  );
  assert.equal(
    said(wind, at("2026-10-28T14:00:00+01:00")),
    "Jutro od 13:00: ostrzeżenie IMGW – silny wiatr [Stopień 1 z 3], do piątku 30 października, 2:00. | Cały powiat.",
  );
  const storm = warning("2026-10-31 13:00:00", "2026-10-31 19:00:00");
  assert.equal(
    said(storm, at("2026-10-28T14:00:00+01:00")),
    "Sobota, 31 października, od 13:00: ostrzeżenie IMGW – silny wiatr [Stopień 1 z 3], do 19:00. | Cały powiat.",
  );
  assert.equal(
    said(storm, at("2026-10-31T09:00:00+01:00")),
    "Dziś od 13:00: ostrzeżenie IMGW – silny wiatr [Stopień 1 z 3], do 19:00. | Cały powiat.",
  );
  assert.equal(said(storm, at("2026-10-31T19:00:00+01:00")), null);
});

test("IMGW without times: no „od”, no „do”, as the water's", () => {
  const bare: Item = {
    ...warning("2026-10-31 13:00:00", "2026-10-31 19:00:00"),
  };
  bare.span = { ...bare.span, from: null, to: null };
  assert.equal(
    said(bare, at("2026-10-30T12:00:00+01:00")),
    "Jutro: ostrzeżenie IMGW – silny wiatr [Stopień 1 z 3]. | Cały powiat.",
  );
  assert.equal(
    said(bare, at("2026-10-28T12:00:00+01:00")),
    "Sobota, 31 października: ostrzeżenie IMGW – silny wiatr [Stopień 1 z 3]. | Cały powiat.",
  );
});

test("pickups: today and tomorrow only; put out until its time", () => {
  const friday = pickup("2026-10-30");
  // Two days ahead: not yet.
  assert.equal(said(friday, at("2026-10-28T23:59:00+01:00")), null);
  assert.equal(
    said(friday, at("2026-10-29T00:00:00+01:00")),
    "Jutro odbiór śmieci: papier, szkło. | Wystaw je do 6:00 rano.",
  );
  assert.equal(
    said(friday, at("2026-10-30T05:59:00+01:00")),
    "Dziś odbiór śmieci: papier, szkło. | Wystaw je do 6:00 rano.",
  );
  assert.equal(
    said(friday, at("2026-10-30T06:00:00+01:00")),
    "Dziś odbiór śmieci: papier, szkło.",
  );
  assert.equal(said(friday, at("2026-10-31T00:00:00+01:00")), null);
  assert.equal(
    said(
      pickup("2026-10-29", "wszystkie pojemniki"),
      at("2026-10-28T12:00:00+01:00"),
    ),
    "Jutro odbiór śmieci: wszystkie pojemniki. | Wystaw je do 6:00 rano.",
  );
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
  const now = at("2026-10-28T12:00:00+01:00");
  const lead = (day: string) => dayLead(day, "x", now);
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
    dayLead("2026-10-26", "poniedziałek", at("2026-10-24T23:30:00Z")),
    "Jutro: poniedziałek",
  );
});

test("the device's clock, unless over 5 minutes before the render", () => {
  const renderedAt = at("2026-10-28T12:00:00+01:00");
  assert.equal(
    trusted(renderedAt - 5 * 60_000, renderedAt),
    renderedAt - 300_000,
  );
  assert.equal(trusted(renderedAt - 5 * 60_000 - 1, renderedAt), renderedAt);
  assert.equal(
    trusted(renderedAt + 3_600_000, renderedAt),
    renderedAt + 3_600_000,
  );
});
