import assert from "node:assert/strict";
import { test } from "node:test";
import type { PlaceView } from "./schedule.ts";
import { hasUpcoming } from "./schedule-notes.ts";
import {
  sourcesOf,
  wastePath,
  wasteSchedule,
  wasteSources,
  wasteStatus,
} from "./waste-module.ts";
import { wasteUpcoming } from "./waste-upcoming.ts";

const pickup = (label: string, putOutBy: string | null = null) => ({
  id: label,
  subtype: label.toLowerCase(),
  label,
  putOutBy,
  shiftedFrom: null,
});

const place = (overrides: Partial<PlaceView> = {}): PlaceView => ({
  id: "0972447-00470",
  kind: "ulica",
  name: "ul. Adama Asnyka",
  label: "ul. Adama Asnyka, Lubaczów",
  area: "Lubaczów",
  group: "0972447",
  gmina: "Lubaczów (miasto)",
  localityId: "0972447",
  streetId: "0972447-00470",
  zoneId: "zone-1",
  today: "2026-10-26",
  schedulePage: null,
  days: [
    { date: "2026-10-20", pickups: [pickup("Papier")] },
    {
      date: "2026-10-28",
      pickups: [pickup("Zmieszane", "06:00"), pickup("Bio")],
    },
  ],
  fractions: ["zmieszane", "bio", "papier"],
  sources: [
    { label: "Sektor 1", url: null, checkedAt: "2026-10-20", seenAt: null },
  ],
  verified: true,
  ...overrides,
});

test("the section: the next pickup on or after today, absolute, its bins", () => {
  assert.deepEqual(wasteStatus(place()), [
    [
      [{ day: "2026-10-28", text: "środa, 28 października" }],
      ["Tego dnia odbiorą:"],
      [{ bins: [pickup("Zmieszane", "06:00"), pickup("Bio")] }],
    ],
    [["Wystaw je do 6:00 w dniu odbioru."]],
  ]);
});

test("every fraction of the zone that day: „wszystkie pojemniki”", () => {
  const all = [pickup("Papier"), pickup("Szkło")];
  const status = (fractions: string[], days: PlaceView["days"]) =>
    wasteStatus(place({ fractions, days }))[0][1];
  const days = [
    { date: "2026-10-27", pickups: all },
    { date: "2026-11-24", pickups: all },
  ];
  assert.deepEqual(status(["papier", "szkło"], days), [
    "Tego dnia odbiorą wszystkie pojemniki:",
  ]);
  // The zone has a fraction no coming day takes (the year's last dates):
  // not all, from the zone's own list, not from the dates left.
  assert.deepEqual(status(["bio", "papier", "szkło"], days), [
    "Tego dnia odbiorą:",
  ]);
  // One fraction only: never „wszystkie”.
  assert.deepEqual(
    status(["szkło"], [{ date: "2026-10-27", pickups: [pickup("Szkło")] }]),
    ["Tego dnia odbiorą:"],
  );
});

test("the timeline: every pickup from today on, its bins, in running text", () => {
  const items = wasteUpcoming(
    place({
      fractions: ["zmieszane", "bio"],
      days: [
        { date: "2026-10-20", pickups: [pickup("Papier")] },
        {
          date: "2026-10-28",
          pickups: [pickup("Zmieszane", "06:00"), pickup("Bio")],
        },
        { date: "2026-10-30", pickups: [pickup("Bio")] },
        { date: "2026-11-02", pickups: [pickup("Zmieszane")] },
      ],
    }),
  );
  assert.deepEqual(
    items.map((item) => item.module === "smieci" && item.bins),
    ["wszystkie pojemniki", "bio", "zmieszane"],
  );
  assert.deepEqual(items[0], {
    module: "smieci",
    span: {
      start: "2026-10-28T00:00:00+01:00",
      end: "2026-10-29T00:00:00+01:00",
      day: "2026-10-28",
      endDay: "2026-10-28",
      from: null,
      to: null,
      about: false,
      until: "czwartku 29 października",
    },
    bins: "wszystkie pojemniki",
    pickups: [pickup("Zmieszane", "06:00"), pickup("Bio")],
    second: "Wystaw je do 6:00 w dniu odbioru.",
  });
  assert.equal(items[1].second, null);
  assert.deepEqual(wasteUpcoming(place({ zoneId: null })), []);
  assert.deepEqual(wasteUpcoming(place({ zoneId: null, days: [] })), []);
});

test("no put-out line without a time, unverified too", () => {
  const unverified = place({
    days: [{ date: "2026-10-27", pickups: [pickup("Szkło")] }],
    verified: false,
  });
  assert.deepEqual(wasteStatus(unverified), [
    [
      [{ day: "2026-10-27", text: "wtorek, 27 października" }],
      ["Tego dnia odbiorą:"],
      [{ bins: [pickup("Szkło")] }],
    ],
  ]);
});

test("no dates: why, then the gmina's schedule, always a line", () => {
  const page = "https://example.org/harmonogram";
  const none = wasteStatus(
    place({ zoneId: null, days: [], schedulePage: page }),
  ).flat();
  assert.equal(none.length, 1);
  // Only the waste schedule is missing, not the place.
  assert.equal(
    none[0][0],
    "Nie mamy jeszcze harmonogramu odbioru śmieci dla tej ulicy. Sprawdź odbiory w harmonogramie Urzędu Miejskiego.",
  );
  assert.deepEqual(none[0].at(-1), {
    href: page,
    text: "Otwórz harmonogram Urzędu Miejskiego w Lubaczowie",
  });
  const ended = wasteStatus(place({ today: "2026-11-01" })).flat();
  assert.equal(
    ended[0][0],
    "Nie mamy jeszcze kolejnych terminów. Dodamy je, gdy tylko pojawi się nowy harmonogram Urzędu Miejskiego. Do tego czasu sprawdź odbiory w harmonogramie Urzędu Miejskiego.",
  );
  assert.equal(ended[0].length, 1);
});

test("one source row each: link, part, when checked", () => {
  assert.deepEqual(wasteSources(place()), [
    ["harmonogram Urzędu Miejskiego w Lubaczowie", ", Sektor 1"],
  ]);
  const url = "https://example.org/a.pdf";
  assert.deepEqual(
    wasteSources(
      place({
        sources: [{ label: "Sektor 2", url, checkedAt: null, seenAt: null }],
      }),
    ),
    [
      [
        { href: url, text: "harmonogram Urzędu Miejskiego w Lubaczowie" },
        ", Sektor 2",
      ],
    ],
  );
});

test("the PDF's QR code and link: the waste subpage", () => {
  assert.equal(wastePath(place()), "/adres/0972447-00470/smieci");
});

test("sources: one per document, its files' oldest lastSeenAt", () => {
  const row = (
    sourceDoc: string,
    seenAt: string | null,
    checkedAt = "2026-10-20",
  ) => ({
    sourceDoc,
    sourceRef: `${sourceDoc}, ref`,
    sourceUrl: `https://example.org/${sourceDoc}.pdf`,
    checkedAt,
    seenAt,
  });
  assert.deepEqual(
    sourcesOf([
      row("a", "2026-10-25T04:00:00Z"),
      row("a", "2026-10-24T04:00:00Z"),
      row("b", "2026-10-25T04:00:00Z"),
      row("b", null),
      row("c", null, "2026-10-01"),
    ]),
    [
      {
        label: "a, ref",
        url: "https://example.org/a.pdf",
        checkedAt: "2026-10-20",
        seenAt: "2026-10-24T04:00:00Z",
      },
      // One file of the document without a row: its day instead.
      {
        label: "b, ref",
        url: "https://example.org/b.pdf",
        checkedAt: "2026-10-20",
        seenAt: null,
      },
      {
        label: "c, ref",
        url: "https://example.org/c.pdf",
        checkedAt: "2026-10-01",
        seenAt: null,
      },
    ],
  );
});

// What harmonogram.pdf draws (app/adres/[id]/harmonogram.pdf/route.ts): the
// days and the footer's sources of getPlace's view, built by wasteSchedule;
// no upcoming day there, no PDF (404).
const upcomingRow = (id: string, start: string, sourceUrl: string) => ({
  id,
  start,
  subtype: "zmieszane",
  label: "Zmieszane",
  shiftedFrom: null,
  verified: true,
  payload: null,
  sourceDoc: `doc-${id}`,
  sourceRef: `Harmonogram ${id}`,
  sourceUrl,
  checkedAt: "2026-10-20",
  seenAt: null,
});

test("PDF: an event without a source prints no date and no footer source", () => {
  const view = wasteSchedule([
    upcomingRow("a", "2026-11-03", "https://example.org/a.pdf"),
    upcomingRow("b", "2026-11-10", ""),
    {
      ...upcomingRow("c", "2026-11-17", "https://example.org/c.pdf"),
      checkedAt: "",
    },
  ]);
  assert.deepEqual(
    view.days.map((d) => [d.date, d.pickups.map((p) => p.id)]),
    [["2026-11-03", ["a"]]],
  );
  assert.deepEqual(
    view.sources.map((s) => s.url),
    ["https://example.org/a.pdf"],
  );
  // Only unsourced dates: nothing upcoming, so the address has no PDF.
  const none = wasteSchedule([upcomingRow("b", "2026-11-10", " ")]);
  assert.deepEqual(none.days, []);
  assert.deepEqual(none.sources, []);
  assert.equal(hasUpcoming(none.days, "2026-11-01"), false);
});
