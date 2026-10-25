import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Disruption } from "./disruptions.ts";
import type { PlaceView } from "./schedule.ts";
import { POST_39885, storedPost, testPlace, zukFile } from "./water-fixture.ts";
import {
  calendarCuts,
  waterCalendar,
  waterCalendarHref,
  waterFilename,
} from "./water-ics.ts";
import { water } from "./water-module.ts";
import { type StoredPost, zukView } from "./zuk-data.ts";

// Sunday 25 Oct 2026, 13:30 in Warsaw (CET since 3:00 today); 39885 cuts
// ul. Żuki in Lubaczów on Tuesday 27 Oct, 8:00-16:00.
const CHECKED = "2026-10-25T12:20:00.000Z";
const NOW = new Date("2026-10-25T12:30:00Z");
const POST_URL =
  "https://www.gminalubaczow.pl/2026/10/23/przerwy-w-dostawie-wody-26-29-10-2026/";
const ZUKI_UID = "woda-39885-0972447-0972447-26555-2026-10-27@conaulicy.pl";

const ZUKI = testPlace();
const ASNYKA = { ...ZUKI, id: "0972447-00470", streetId: "0972447-00470" };

const post = (over: Partial<StoredPost> = {}, checkedAt = CHECKED) =>
  storedPost(POST_39885, checkedAt, over);

/** 39885 with its cut on ul. Żuki changed by `change`. */
const zukiPost = (change: Partial<Disruption>) => {
  const items = post().items.map((d) =>
    d.place.streetId === ZUKI.streetId ? { ...d, ...change } : d,
  );
  return post({ items });
};

const at = (
  posts: StoredPost[],
  place: PlaceView = ZUKI,
  now = NOW,
  checkedAt = CHECKED,
) => water(zukView(zukFile(posts, checkedAt), now), place);

/** The file unfolded, one property per line. */
const lines = (ics: string) => ics.replace(/\r\n /g, "").split("\r\n");

const events = (ics: string) => ics.split("BEGIN:VEVENT").length - 1;

const value = (ics: string, name: string) =>
  lines(ics)
    .filter(
      (line) => line.startsWith(`${name}:`) || line.startsWith(`${name};`),
    )
    .map((line) => line.slice(line.indexOf(":") + 1));

test("a cut at the address: one event, Warsaw hours, place and source", () => {
  const ics = waterCalendar(at([post()]), NOW);
  assert.equal(events(ics), 1);
  const all = lines(ics);
  for (const line of [
    "X-WR-CALNAME:Przerwy w dostawie wody – ul. Żuki\\, Lubaczów",
    "BEGIN:VTIMEZONE",
    "TZID:Europe/Warsaw",
    `UID:${ZUKI_UID}`,
    "DTSTART;TZID=Europe/Warsaw:20261027T080000",
    "DTEND;TZID=Europe/Warsaw:20261027T160000",
    "SUMMARY:Przerwa w dostawie wody",
    "LOCATION:ul. Żuki\\, Lubaczów",
    `URL:${POST_URL}`,
    "STATUS:CONFIRMED",
  ])
    assert.ok(all.includes(line), line);
  const [description] = value(ics, "DESCRIPTION");
  assert.match(description, /^Cała ulica Żuki\.\\n/);
  assert.ok(description.includes(`Źródło: ${POST_URL}`));
  // Every line folded to 75 octets, CRLF throughout.
  for (const line of ics.split("\r\n"))
    assert.ok(new TextEncoder().encode(line).length <= 75, line);
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
});

test("the alarm: the evening before, 18:00 in Warsaw", () => {
  const ics = waterCalendar(at([post()]), NOW);
  const all = lines(ics);
  // Monday 26 Oct, 18:00 CET.
  assert.ok(all.includes("TRIGGER;VALUE=DATE-TIME:20261026T170000Z"));
  assert.ok(
    all.includes("DESCRIPTION:Jutro przerwa w dostawie wody\\, 8:00–16:00"),
  );
  assert.equal(value(ics, "BEGIN").filter((v) => v === "VALARM").length, 1);
});

test("across the change to winter time: wall clock kept, alarm in CEST", () => {
  // Saturday 24 Oct 22:00 CEST to Sunday 25 Oct 4:00 CET, the night the
  // clocks go back.
  const night = zukiPost({
    date: "2026-10-24",
    start: "2026-10-24 22:00:00",
    end: "2026-10-25 04:00:00",
  });
  const saturday = new Date("2026-10-24T10:00:00Z");
  const ics = waterCalendar(
    at([night], ZUKI, saturday, "2026-10-24T09:50:00Z"),
    saturday,
  );
  const all = lines(ics);
  assert.ok(all.includes("DTSTART;TZID=Europe/Warsaw:20261024T220000"));
  assert.ok(all.includes("DTEND;TZID=Europe/Warsaw:20261025T040000"));
  // Friday 23 Oct, 18:00 CEST.
  assert.ok(all.includes("TRIGGER;VALUE=DATE-TIME:20261023T160000Z"));
  assert.ok(all.includes("DTSTART:19701025T030000"));
  assert.ok(all.includes("RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU"));
  assert.ok(
    all.includes(
      "DESCRIPTION:Jutro przerwa w dostawie wody\\, 22:00 – niedziela\\, 25 października\\, 4:00",
    ),
  );
});

test("the UID stays across loads; DTSTAMP is the download's", () => {
  const first = waterCalendar(at([post()]), NOW);
  const later = new Date("2026-10-25T15:00:00Z");
  const again = waterCalendar(
    at([post({}, "2026-10-25T14:55:00Z")], ZUKI, later, "2026-10-25T14:55:00Z"),
    later,
  );
  assert.deepEqual(value(first, "UID"), [ZUKI_UID]);
  assert.deepEqual(value(again, "UID"), [ZUKI_UID]);
  assert.notDeepEqual(value(first, "DTSTAMP"), value(again, "DTSTAMP"));
});

test("SEQUENCE grows when the post is edited; the UID stays", () => {
  const before = waterCalendar(at([post()]), NOW);
  const edited = waterCalendar(
    at([
      zukiPost({
        updatedAt: "2026-10-24 09:15:00",
        end: "2026-10-27 18:00:00",
      }),
    ]),
    NOW,
  );
  const [seq] = value(before, "SEQUENCE").map(Number);
  const [next] = value(edited, "SEQUENCE").map(Number);
  // 23 Oct 2026, 18:59 CEST, in minutes since 1970.
  assert.equal(seq, Math.floor(Date.parse("2026-10-23T16:59:43Z") / 60_000));
  assert.ok(next > seq, `${next} > ${seq}`);
  assert.deepEqual(value(edited, "UID"), [ZUKI_UID]);
  assert.ok(lines(edited).includes("DTEND;TZID=Europe/Warsaw:20261027T180000"));
});

test("only planned cuts with both hours go in", () => {
  const cases: Array<[string, Partial<Disruption>]> = [
    ["an emergency", { cause: "emergency" }],
    ["no end", { end: null }],
    ["no start", { start: null }],
  ];
  for (const [what, change] of cases) {
    const data = at([zukiPost(change)]);
    // Still on the page, as an outage …
    assert.equal(data.outages.length, 1, what);
    // … but not in the calendar.
    assert.deepEqual(calendarCuts(data), [], what);
    assert.equal(events(waterCalendar(data, NOW)), 0, what);
  }
});

test("a Notice (a link, no date) never goes in", () => {
  const notice = post({ status: "notice", reason: "x", items: [] });
  const data = at([notice]);
  assert.equal(data.notices.length, 1);
  assert.deepEqual(calendarCuts(data), []);
});

test("no cut here: an empty calendar, as a waste zone with no dates", () => {
  for (const data of [at([post()], ASNYKA), at([])]) {
    const ics = waterCalendar(data, NOW);
    assert.equal(events(ics), 0);
    assert.match(ics, /^BEGIN:VCALENDAR\r\n[\s\S]*END:VCALENDAR\r\n$/);
  }
  const none = water(zukView(null, NOW), ZUKI);
  assert.equal(events(waterCalendar(none, NOW)), 0);
});

test("the house number: in the place and the file name", () => {
  const data = at([post()], { ...ZUKI, givenNr: "12" });
  assert.ok(
    lines(waterCalendar(data, NOW)).includes(
      "LOCATION:ul. Żuki 12\\, Lubaczów",
    ),
  );
  assert.equal(waterFilename(data), "woda-ul-zuki-12-lubaczow.ics");
});

test("the page and the file share the loader and the cut list", () => {
  const read = (path: string) =>
    readFileSync(new URL(path, import.meta.url), "utf8");
  assert.match(read("./modules.ts"), /\bload: loadWater,/);
  const route = read("../app/adres/[id]/woda.ics/route.ts");
  assert.match(route, /from "@\/lib\/water-load"/);
  assert.match(route, /await loadWater\(/);
  // The button shows exactly when the file has an event.
  assert.match(
    read("../components/water-page.tsx"),
    /const calendar = waterCalendarHref\(data\);/,
  );
});

test("the button's link: the file, with the house number as given", () => {
  assert.equal(
    waterCalendarHref(at([post()])),
    "/adres/0972447-26555/woda.ics",
  );
  assert.equal(
    waterCalendarHref(at([post()], { ...ZUKI, givenNr: "12" })),
    "/adres/0972447-26555/woda.ics?nr=12",
  );
});

test("no dated cut, no button: an emergency, no hours, a Notice, none", () => {
  const notice = post({ status: "notice", reason: "x", items: [] });
  for (const data of [
    at([zukiPost({ cause: "emergency" })]),
    at([zukiPost({ end: null })]),
    at([notice]),
    at([post()], ASNYKA),
    water(zukView(null, NOW), ZUKI),
  ])
    assert.equal(waterCalendarHref(data), null);
});
