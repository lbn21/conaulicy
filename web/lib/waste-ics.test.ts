import assert from "node:assert/strict";
import { test } from "node:test";
import { escapeText } from "./ics.ts";
import { DISCLAIMER, disclaimer, putOutNote } from "./schedule-notes.ts";
import { events, folded, lines, value } from "./test-ics.ts";
import {
  wasteCalendar,
  wasteCalendarName,
  wasteFilename,
} from "./waste-ics.ts";

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

const SOURCE = "https://www.lubaczow.com.pl/harmonogram-odbioru-odpadow-2026";
const pickup = (id: string, start: string, putOutBy?: string) => ({
  id,
  start,
  label: "Odpady zmieszane",
  sourceUrl: SOURCE,
  checkedAt: "2026-10-25",
  payload: putOutBy ? { putOutBy } : null,
});
const ZONE = {
  name: "Gmina Lubaczów, sektor 1",
  gmina: "Lubaczów (gmina)",
  events: [pickup("a1", "2026-11-30", "06:00"), pickup("b2", "2026-12-31")],
};

test("waste calendar: stable UIDs, all-day dates with an exclusive end", () => {
  const now = new Date("2026-11-07T15:00:00Z");
  const ics = wasteCalendar(ZONE, now);
  assert.equal(events(ics), 2);
  assert.deepEqual(value(ics, "UID"), ["a1@conaulicy", "b2@conaulicy"]);
  assert.deepEqual(value(ics, "DTSTAMP"), [
    "20261107T150000Z",
    "20261107T150000Z",
  ]);
  // DTEND is the day after: across a month and a year.
  assert.deepEqual(value(ics, "DTSTART"), ["20261130", "20261231"]);
  assert.deepEqual(value(ics, "DTEND"), ["20261201", "20270101"]);
  assert.ok(lines(ics).includes("DTSTART;VALUE=DATE:20261130"));
  assert.ok(lines(ics).includes("DTEND;VALUE=DATE:20261201"));
  // Another download: the same UIDs, only DTSTAMP moves.
  const later = wasteCalendar(ZONE, new Date("2026-11-08T04:00:00Z"));
  assert.deepEqual(value(later, "UID"), value(ics, "UID"));
  assert.deepEqual(value(later, "DTSTAMP"), [
    "20261108T040000Z",
    "20261108T040000Z",
  ]);
  assert.equal(
    later.replace(/DTSTAMP:\S+/g, ""),
    ics.replace(/DTSTAMP:\S+/g, ""),
  );
});

test("waste calendar: each description names its source and the day checked", () => {
  const ics = wasteCalendar(ZONE, new Date("2026-11-07T15:00:00Z"));
  const [first, second] = value(ics, "DESCRIPTION");
  const source = `Źródło: ${SOURCE} (stan na 25 października 2026)`;
  assert.equal(
    first,
    escapeText(
      [putOutNote("06:00"), source, disclaimer("Lubaczów (gmina)")].join("\n"),
    ),
  );
  assert.equal(
    second,
    escapeText([source, disclaimer("Lubaczów (gmina)")].join("\n")),
  );
  // Without a gmina: the general disclaimer.
  const anywhere = wasteCalendar({ ...ZONE, gmina: null }, new Date());
  assert.ok(value(anywhere, "DESCRIPTION")[1].endsWith(escapeText(DISCLAIMER)));
});

test("waste calendar: long lines folded to 75 octets, whole when unfolded", () => {
  const ics = wasteCalendar(ZONE, new Date("2026-11-07T15:00:00Z"));
  folded(ics);
  assert.ok(ics.includes("\r\n "), "the description is folded");
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  // Unfolded, the description is whole again, Polish letters too.
  assert.ok(
    value(ics, "DESCRIPTION")[0].includes("stan na 25 października 2026"),
  );
});

test("waste calendar without dates: no event, no note on next year", () => {
  const ics = wasteCalendar({ ...ZONE, events: [] }, new Date());
  assert.equal(events(ics), 0);
  assert.deepEqual(value(ics, "X-WR-CALDESC"), []);
  assert.deepEqual(value(ics, "X-WR-CALNAME"), [
    "Wywóz śmieci – Gmina Lubaczów\\, sektor 1",
  ]);
});

test("waste calendar: an event without its source or checked day is left out", () => {
  const ics = wasteCalendar(
    {
      ...ZONE,
      events: [
        pickup("a1", "2026-11-30"),
        { ...pickup("nourl", "2026-12-07"), sourceUrl: "" },
        { ...pickup("blank", "2026-12-14"), sourceUrl: "   " },
        { ...pickup("notweb", "2026-12-21"), sourceUrl: "docs/data/a.pdf" },
        { ...pickup("nocheck", "2026-12-28"), checkedAt: "" },
      ],
    },
    new Date("2026-10-25T12:00:00Z"),
  );
  assert.equal(events(ics), 1);
  assert.deepEqual(value(ics, "UID"), ["a1@conaulicy"]);
  assert.deepEqual(value(ics, "DTSTART"), ["20261130"]);
});
