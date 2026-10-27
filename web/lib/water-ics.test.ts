import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { SITE_URL } from "./config.generated.ts";
import type { Disruption } from "./disruptions.ts";
import { CUT_100 } from "./mzgkim-fixture.ts";
import type { PlaceView } from "./schedule.ts";
import {
  bothViews,
  KROWICA_RANGE,
  lisiePartly,
  mzgkimPost,
  POST_39885,
  SOBIESKIEGO_RANGE,
  sobieskiego,
  storedPost,
  testPlace,
} from "./water-fixture.ts";
import {
  calendarCuts,
  waterCalendar,
  waterCalendarHref,
  waterFilename,
} from "./water-ics.ts";
import { water } from "./water-module.ts";
import type { StoredPost } from "./zuk-data.ts";

// Sunday 25 Oct 2026, 13:30 in Warsaw (CET since 3:00 today); 39885 cuts
// ul. Żuki in Lubaczów on Tuesday 27 Oct, 8:00-16:00.
const CHECKED = "2026-10-25T12:20:00.000Z";
const NOW = new Date("2026-10-25T12:30:00Z");
const POST_URL =
  "https://www.gminalubaczow.pl/2026/10/23/przerwy-w-dostawie-wody-26-29-10-2026/";
const ZUKI_UID = "woda-39885-0972447-0972447-26555-2026-10-27@conaulicy.pl";
// The /woda page each event and its alarm link to, from SITE_URL.
const ZUKI_PAGE = `${SITE_URL}/adres/0972447-26555/woda`;
const CHECK = `Sprawdź\\, czy przerwa jest aktualna: ${ZUKI_PAGE}`;

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
) => water(bothViews(posts, checkedAt, now), place);

/** The file unfolded, one property per line. */
const lines = (ics: string) => ics.replace(/\r\n /g, "").split("\r\n");

/** Every line folded to 75 octets. */
const folded = (ics: string) => {
  for (const line of ics.split("\r\n"))
    assert.ok(new TextEncoder().encode(line).length <= 75, line);
};

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
  // The last line: our /woda page, which always shows the current state.
  assert.ok(description.endsWith(`rację ma komunikat.\\n${CHECK}`));
  assert.equal(ZUKI_PAGE, "https://conaulicy.pl/adres/0972447-26555/woda");
  assert.ok(
    description.endsWith(
      "\\nSprawdź\\, czy przerwa jest aktualna: https://conaulicy.pl/adres/0972447-26555/woda",
    ),
  );
  folded(ics);
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
});

test("a village part: its whole village's cuts, 26 and 29 Oct", () => {
  // Smolińce, a part of Lisie Jamy, cut with the whole village in 39885.
  const smolince = testPlace({
    id: "0606257",
    kind: "wies",
    name: "Smolińce",
    label: "Smolińce",
    area: "Lisie Jamy",
    group: "0606234",
    gmina: "Lubaczów (gmina)",
    localityId: "0606257",
    streetId: null,
  });
  const ics = waterCalendar(at([post()], smolince), NOW);
  assert.equal(events(ics), 2);
  assert.deepEqual(value(ics, "DTSTART;TZID=Europe/Warsaw"), [
    "20261026T080000",
    "20261029T080000",
  ]);
});

test("the alarm: the evening before, 18:00 in Warsaw", () => {
  const ics = waterCalendar(at([post()]), NOW);
  const all = lines(ics);
  // Monday 26 Oct, 18:00 CET.
  assert.ok(all.includes("TRIGGER;VALUE=DATE-TIME:20261026T170000Z"));
  assert.ok(
    all.includes(
      `DESCRIPTION:Jutro przerwa w dostawie wody\\, 8:00–16:00.\\n${CHECK}`,
    ),
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
      `DESCRIPTION:Jutro przerwa w dostawie wody\\, 22:00 – niedziela\\, 25 października\\, 4:00.\\n${CHECK}`,
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
  const none = water({}, ZUKI);
  assert.equal(events(waterCalendar(none, NOW)), 0);
});

test("the house number: in the place, the file name and the page link", () => {
  const data = at([post()], { ...ZUKI, givenNr: "12" });
  const ics = waterCalendar(data, NOW);
  assert.ok(lines(ics).includes("LOCATION:ul. Żuki 12\\, Lubaczów"));
  assert.equal(waterFilename(data), "woda-ul-zuki-12-lubaczow.ics");
  const page = `${ZUKI_PAGE}?nr=12`;
  assert.equal(page, "https://conaulicy.pl/adres/0972447-26555/woda?nr=12");
  assert.ok(
    value(ics, "DESCRIPTION")[0].endsWith(
      `\\nSprawdź\\, czy przerwa jest aktualna: ${page}`,
    ),
  );
});

test("a streetless village with a house number: the link keeps ?nr=, folded", () => {
  const opaka = testPlace({
    id: "0606317",
    kind: "wies",
    name: "Opaka",
    label: "Opaka",
    localityId: "0606317",
    streetId: null,
    givenNr: "105",
  });
  // 39885: Opaka „od numeru 104 do 110” on 27 Oct; 105 is inside.
  const data = at([post()], opaka);
  const cuts = calendarCuts(data).filter(
    (cut) => cut.place.localityId === "0606317",
  );
  assert.equal(cuts.length, 1);
  assert.equal(cuts[0].date, "2026-10-27");
  const ics = waterCalendar(data, NOW);
  assert.equal(events(ics), 1);
  const page = `${SITE_URL}/adres/0606317/woda?nr=105`;
  assert.equal(page, "https://conaulicy.pl/adres/0606317/woda?nr=105");
  const check = `Sprawdź\\, czy przerwa jest aktualna: ${page}`;
  assert.ok(value(ics, "DESCRIPTION")[0].endsWith(`\\n${check}`));
  assert.ok(value(ics, "DESCRIPTION")[1].endsWith(`.\\n${check}`));
  // The raw file: no line over 75 octets; unfolded, the exact URL.
  folded(ics);
  assert.ok(lines(ics).some((line) => line.includes(page)));
});

test("39885's Załuże, Podłęże 44–92: an event for nr 50, none for nr 10", () => {
  const zaluze = (givenNr: string) =>
    testPlace({
      id: "0606464",
      kind: "wies",
      name: "Załuże",
      label: "Załuże",
      localityId: "0606464",
      streetId: null,
      givenNr,
    });
  const ics = (nr: string) => waterCalendar(at([post()], zaluze(nr)), NOW);
  assert.equal(events(ics("50")), 1);
  assert.deepEqual(value(ics("50"), "DTSTART;TZID=Europe/Warsaw"), [
    "20261028T080000",
  ]);
  assert.equal(events(ics("10")), 0);
});

test("house numbers in a village with streets: the village's UID, the range as written", () => {
  const [base] = post().items;
  const krowica: Disruption = {
    ...base,
    uid: "zuk-39885-2026-10-26-0606180",
    ...KROWICA_RANGE,
  };
  // From a street page of the village: the same event.
  const osiedle = {
    ...ZUKI,
    id: "0606180-51473",
    localityId: "0606180",
    streetId: "0606180-51473",
  };
  const ics = waterCalendar(at([post({ items: [krowica] })], osiedle), NOW);
  assert.equal(events(ics), 1);
  assert.deepEqual(value(ics, "UID"), [
    "woda-39885-0606180-all-2026-10-26@conaulicy.pl",
  ]);
  assert.ok(
    value(ics, "DESCRIPTION")[0].startsWith("Krowica Sama: od nr 10 do nr 50."),
  );
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
    water({}, ZUKI),
  ])
    assert.equal(waterCalendarHref(data), null);
});

test("a house number outside a cut's range: no event; inside: the same UID", () => {
  const [first] = post().items;
  const sob = post({ items: [{ ...first, ...SOBIESKIEGO_RANGE }] });
  const outside = at([sob], sobieskiego("5"));
  assert.equal(events(waterCalendar(outside, NOW)), 0);
  assert.equal(waterCalendarHref(outside), null);
  const inside = waterCalendar(at([sob], sobieskiego("30")), NOW);
  assert.equal(events(inside), 1);
  assert.deepEqual(value(inside, "UID"), [
    `woda-${POST_39885}-0606116-0606116-20431-${first.date}@conaulicy.pl`,
  ]);
});

test("an MZGKiM cut: its own UID, its post as the source and the note", () => {
  // 5237's Niemirowska cut, 6 Oct 2026 8:30-15:00, seen on 3 Oct.
  const checked = "2026-10-03T09:50:00.000Z";
  const now = new Date("2026-10-03T10:00:00Z");
  const niemirowska = testPlace({
    id: "0972447-14183",
    streetId: "0972447-14183",
    label: "ul. Niemirowska, Lubaczów",
  });
  const data = water(
    bothViews([], checked, now, [mzgkimPost(CUT_100, checked)]),
    niemirowska,
  );
  const ics = waterCalendar(data, now);
  assert.equal(events(ics), 1);
  const all = lines(ics);
  const url = "https://mzgkim.lubaczow.pl/przerwa-w-dostawie-wody-100/";
  for (const line of [
    "UID:woda-mzgkim-5237-0972447-0972447-14183-2026-10-06@conaulicy.pl",
    "DTSTART;TZID=Europe/Warsaw:20261006T083000",
    "DTEND;TZID=Europe/Warsaw:20261006T150000",
    `URL:${url}`,
  ])
    assert.ok(all.includes(line), line);
  const [description] = value(ics, "DESCRIPTION");
  assert.match(description, /^Cała ulica Niemirowska\.\\n/);
  assert.ok(description.includes(`Źródło: ${url}`));
  assert.ok(
    description.includes(
      "Daty i godziny odczytaliśmy z komunikatu MZGKiM. Gdyby coś się nie zgadzało\\, rację ma komunikat.",
    ),
  );
  folded(ics);
});

// Task 188: a village's grouped streets, a part's village, the note's dash.

const villagePlace = (
  id: string,
  name: string,
  givenNr: string | null = null,
) =>
  testPlace({
    id,
    kind: "wies",
    name,
    label: name,
    localityId: id,
    streetId: null,
    givenNr,
  });

test("a village's streets in one post and hours: one event, its own UID", () => {
  const [base] = post().items;
  const street = (sym: string, name: string): Disruption => ({
    ...base,
    uid: `zuk-39885-2026-10-27-0606234-${sym}`,
    date: "2026-10-27",
    start: "2026-10-27 08:00:00",
    end: "2026-10-27 12:00:00",
    place: { localityId: "0606234", streetId: `0606234-${sym}` },
    label: { locality: "Lisie Jamy", parent: null, street: name },
    scope: { type: "whole" },
    note: null,
  });
  const items = [
    street("03839", "Długa"),
    street("23795", "Wąska"),
    street("10898", "Leśna"),
    street("26081", "Zielona"),
  ];
  const ics = waterCalendar(
    at([post({ items })], villagePlace("0606234", "Lisie Jamy")),
    NOW,
  );
  assert.equal(events(ics), 1);
  assert.deepEqual(value(ics, "UID"), [
    "woda-39885-0606234-ulice-2026-10-27-0800@conaulicy.pl",
  ]);
  assert.match(
    value(ics, "DESCRIPTION")[0] as string,
    /^Część miejscowości Lisie Jamy: ulice Długa\\, Wąska\\, Leśna i Zielona\.\\n/,
  );
  // The street's own file: its UID as ever.
  const dluga = testPlace({
    id: "0606234-03839",
    localityId: "0606234",
    streetId: "0606234-03839",
  });
  assert.deepEqual(
    value(waterCalendar(at([post({ items })], dluga), NOW), "UID"),
    ["woda-39885-0606234-0606234-03839-2026-10-27@conaulicy.pl"],
  );
});

test("a part: its village's partial cut, the village's UID, a line to check", () => {
  const ics = waterCalendar(
    at([post()], villagePlace("0606470", "Czarne")),
    NOW,
  );
  assert.deepEqual(value(ics, "UID"), [
    "woda-39885-0606464-all-2026-10-28@conaulicy.pl",
  ]);
  assert.equal(
    value(ics, "DESCRIPTION")[0]?.split("\\n").slice(0, 2).join("\n"),
    "Załuże: Podłęże od numeru 44 do numeru 92.\nCzarne należy do miejscowości Załuże\\, a komunikat dotyczy tylko jej części. Sprawdź\\, czy obejmuje Twój dom.",
  );
  const zaluze = (nr: string) =>
    waterCalendar(at([post()], villagePlace("0606464", "Załuże", nr)), NOW);
  assert.deepEqual(value(zaluze("44"), "UID"), [
    "woda-39885-0606464-all-2026-10-28@conaulicy.pl",
  ]);
  assert.doesNotMatch(zaluze("44"), /należy do miejscowości/);
  assert.equal(events(zaluze("43")), 0);
  // Smolińce: Lisie Jamy's whole cuts, no line to check.
  assert.doesNotMatch(
    waterCalendar(at([post()], villagePlace("0606257", "Smolińce")), NOW),
    /należy do miejscowości/,
  );
});

test("a village cut in part and the gate's street copies: one event", () => {
  const [base] = post().items;
  const ics = waterCalendar(
    at(
      [
        post({
          items: [
            lisiePartly(base, null),
            lisiePartly(base, "0606234-03839", "Długa"),
          ],
        }),
      ],
      villagePlace("0606234", "Lisie Jamy"),
    ),
    NOW,
  );
  assert.deepEqual(value(ics, "UID"), [
    "woda-39885-0606234-all-2026-10-27@conaulicy.pl",
  ]);
});

test("a part's linked street: its village named, the street page's UID", () => {
  const ics = waterCalendar(
    at([post()], villagePlace("0606300", "Pilipy")),
    NOW,
  );
  assert.deepEqual(value(ics, "UID"), [
    "woda-39885-0606286-0606286-39507-2026-10-28@conaulicy.pl",
  ]);
  assert.match(
    value(ics, "DESCRIPTION")[0] as string,
    /^Ulica Pilipy w Młodowie\.\\n/,
  );
});
