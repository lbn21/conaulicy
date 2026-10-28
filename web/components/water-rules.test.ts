import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Disruption } from "../lib/disruptions.ts";
import { visible } from "../lib/upcoming.ts";
import { bothViews, testPlace, zukFile } from "../lib/water-fixture.ts";
import { waterCalendar, waterCalendarHref } from "../lib/water-ics.ts";
import {
  type Water,
  water,
  waterStatus,
  waterUpcoming,
} from "../lib/water-module.ts";
import { type StoredPost, zukView } from "../lib/zuk-data.ts";
import { WaterDetails } from "./water-page.tsx";

// The water module's shared rules on a made-up place and post, at fixed
// instants: a cut is over at its end (or, with none, at the Warsaw midnight
// after its day) everywhere at once.
const STREET = "0000001-00001";
const PLACE = testPlace({
  id: STREET,
  name: "ul. Próbna",
  label: "ul. Próbna, Wzorowo",
  area: "Wzorowo",
  group: "0000001",
  gmina: "Wzorowo",
  localityId: "0000001",
  streetId: STREET,
});
const CHECKED = "2026-10-20T10:00:00.000Z";
const URL = "https://example.org/komunikat";

const cut = (over: Partial<Disruption> & { date: string }): Disruption => ({
  uid: `zuk-1-${over.date}-${STREET}`,
  kind: "water",
  cause: "planned",
  start: null,
  end: null,
  endEstimated: false,
  place: { localityId: "0000001", streetId: STREET },
  label: { locality: "Wzorowo", parent: null, street: "Próbna" },
  where: "Wzorowo, ul. Próbna",
  scope: { type: "whole" },
  note: null,
  publishedAt: "2026-10-20 10:00:00",
  updatedAt: "2026-10-20 10:00:00",
  source: { name: "Gmina", url: URL, checkedAt: CHECKED },
  ...over,
});

const post = (items: Disruption[]): StoredPost => ({
  id: 1,
  modified: "2026-10-20T10:00:00",
  reader: 1,
  url: URL,
  title: "Przerwy w dostawie wody",
  publishedAt: "2026-10-20 10:00:00",
  updatedAt: "2026-10-20 10:00:00",
  status: "parsed",
  localityIds: ["0000001"],
  itemCount: items.length,
  items,
  sourceId: "gmina-lubaczow",
});

const at = (items: Disruption[], now: Date, place = PLACE): Water =>
  water(bothViews([post(items)], now.toISOString(), now), place);

// One a day, so no two give one place and day different hours.
const CUTS = [
  cut({
    date: "2026-10-28",
    start: "2026-10-28 08:00:00",
    end: "2026-10-28 16:00:00",
  }),
  cut({ date: "2026-10-29", start: "2026-10-29 10:00:00" }),
  cut({
    date: "2026-10-30",
    start: "2026-10-30 22:00:00",
    end: "2026-10-31 02:00:00",
  }),
  cut({ date: "2026-10-31" }),
];
const RENDERED = new Date("2026-10-27T12:00:00Z");

test("over at its end: the section's cuts at `now`, the block's too", () => {
  // Warsaw is UTC+1 (CET) on every one of these days.
  const table: Array<[string, string[]]> = [
    [
      "2026-10-28T06:59:59Z",
      ["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"],
    ],
    [
      "2026-10-28T14:59:59Z",
      ["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"],
    ],
    // 16:00 in Warsaw: the first is over, not at midnight.
    ["2026-10-28T15:00:00Z", ["2026-10-29", "2026-10-30", "2026-10-31"]],
    // No end: until the midnight after its day.
    ["2026-10-29T22:59:59Z", ["2026-10-29", "2026-10-30", "2026-10-31"]],
    ["2026-10-29T23:00:00Z", ["2026-10-30", "2026-10-31"]],
    // A night cut: over the next day at its end.
    ["2026-10-31T00:59:59Z", ["2026-10-30", "2026-10-31"]],
    ["2026-10-31T01:00:00Z", ["2026-10-31"]],
    ["2026-10-31T22:59:59Z", ["2026-10-31"]],
    ["2026-10-31T23:00:00Z", []],
  ];
  const cached = waterUpcoming(at(CUTS, RENDERED));
  for (const [iso, days] of table) {
    const now = new Date(iso);
    const data = at(CUTS, now);
    assert.deepEqual(
      data.outages.map((d) => d.date),
      days,
      iso,
    );
    // The block, rendered now or earlier (the island's clock), agrees.
    const block = (items: ReturnType<typeof waterUpcoming>) =>
      items
        .filter((item) => visible(item, now.getTime()))
        .map((item) => item.span.day);
    assert.deepEqual(block(waterUpcoming(data)), days, iso);
    assert.deepEqual(block(cached), days, iso);
  }
});

test("over at its end: no status, /woda, button or event once over", () => {
  const before = at(CUTS, new Date("2026-10-28T14:59:59Z"));
  const after = at(CUTS, new Date("2026-10-31T01:00:00Z"));
  assert.match(
    waterCalendar(before, RENDERED),
    /DTSTART;TZID=[^:]+:20261028T080000/,
  );
  assert.ok(waterCalendarHref(before));
  // Only the day without hours is left: nothing for the calendar.
  assert.equal(waterCalendarHref(after), null);
  assert.doesNotMatch(waterCalendar(after, RENDERED), /BEGIN:VEVENT/);
  const status = JSON.stringify(waterStatus(after));
  assert.doesNotMatch(
    status,
    /28 października|29 października|30 października/,
  );
  const page = renderToStaticMarkup(
    createElement(WaterDetails, { data: after }),
  );
  assert.doesNotMatch(page, /28 października|29 października|30 października/);
  assert.match(page, /31 października/);
  const none = at(CUTS, new Date("2026-10-31T23:00:00Z"));
  assert.deepEqual(waterStatus(none), [[["Brak zapowiedzianych przerw."]]]);
});

test("over at its end: the line on a number left out goes too", () => {
  const other = [
    cut({
      date: "2026-10-28",
      start: "2026-10-28 08:00:00",
      end: "2026-10-28 16:00:00",
      scope: { type: "numbers", numbers: ["7"] },
    }),
  ];
  const five = { ...PLACE, givenNr: "5" };
  const before = at(other, new Date("2026-10-28T14:59:59Z"), five);
  assert.equal(before.hiddenForNr, true);
  assert.match(JSON.stringify(waterStatus(before)), /nie obejmuje nr 5/);
  const after = at(other, new Date("2026-10-28T15:00:00Z"), five);
  assert.equal(after.hiddenForNr, false);
  assert.doesNotMatch(JSON.stringify(waterStatus(after)), /nie obejmuje/);
});

test("no end: kept until the Warsaw midnight after its day, DST days too", () => {
  for (const [date, midnight] of [
    // Back to CET at 3:00: 25 hours.
    ["2026-10-25", "2026-10-25T23:00:00Z"],
    // On to CEST at 2:00: 23 hours.
    ["2027-03-28", "2027-03-28T22:00:00Z"],
  ]) {
    const file = zukFile([post([cut({ date })])], CHECKED);
    const day = (iso: string) =>
      zukView(file, new Date(iso)).disruptions.map((d) => d.date);
    const end = Date.parse(midnight);
    assert.deepEqual(day(new Date(end - 1).toISOString()), [date], date);
    assert.deepEqual(day(midnight), [], date);
  }
});
