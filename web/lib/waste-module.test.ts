import assert from "node:assert/strict";
import { test } from "node:test";
import { checkedLine } from "./hub.ts";
import type { PlaceView } from "./schedule.ts";
import {
  sourcesOf,
  wasteChecked,
  wasteNote,
  wastePath,
  wasteSources,
  wasteStatus,
} from "./waste-module.ts";
import { wasteUpcoming } from "./waste-upcoming.ts";

const wasteLine = (at: Parameters<typeof checkedLine>[0]) =>
  checkedLine(at, "smieci");

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
  nr: null,
  askNumber: false,
  unknownNr: null,
  givenNr: null,
  invalidNr: null,
  knownNr: false,
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
    [["Wystaw je do 6:00 rano."]],
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

test("the block: the next two days, from the day before, bins in running text", () => {
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
    ["wszystkie pojemniki", "bio"],
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
      date: "środa, 28 października",
      until: "czwartku 29 października",
    },
    shownFrom: "2026-10-27T00:00:00+01:00",
    bins: "wszystkie pojemniki",
    second: "Wystaw je do 6:00 rano.",
    secondUntil: "2026-10-28T06:00:00+01:00",
  });
  assert.equal(items[1].second, null);
  assert.deepEqual(wasteUpcoming(place({ askNumber: true, zoneId: null })), []);
  assert.deepEqual(wasteUpcoming(place({ zoneId: null, days: [] })), []);
});

test("no put-out line without a time; a note in the meta line while unverified", () => {
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
  assert.equal(
    wasteNote(unverified),
    "Daty przepisał program – jeśli coś się nie zgadza, ważniejszy jest harmonogram.",
  );
  assert.equal(wasteNote(place()), null);
});

test("a split street without a number links the waste subpage's question", () => {
  assert.deepEqual(wasteStatus(place({ askNumber: true, zoneId: null })), [
    [
      [
        "Na tej ulicy śmieciarka przyjeżdża w różne dni, zależnie od numeru. ",
        { href: "/adres/0972447-00470/smieci", text: "Podaj numer domu" },
      ],
    ],
  ]);
});

test("no dates: why, then the gmina's schedule, always a line", () => {
  const page = "https://example.org/harmonogram";
  const none = wasteStatus(
    place({ zoneId: null, days: [], schedulePage: page }),
  ).flat();
  assert.equal(none.length, 1);
  assert.match(String(none[0][0]), /^Tej ulicy jeszcze nie mamy\./);
  assert.deepEqual(none[0].at(-1), {
    href: page,
    text: "Otwórz harmonogram Urzędu Miejskiego w Lubaczowie",
  });
  const ended = wasteStatus(place({ today: "2026-11-01" })).flat();
  assert.match(String(ended[0][0]), /^Nie mamy jeszcze kolejnych terminów/);
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

test("the PDF's QR code and link: the waste subpage, with the number", () => {
  assert.equal(wastePath(place()), "/adres/0972447-00470/smieci");
  assert.equal(
    wastePath(place({ id: "0972447-90004", nr: "7a" })),
    "/adres/0972447-90004/smieci?nr=7a",
  );
});

test("checked line: events.checkedAt, a day; source_files.lastSeenAt, Warsaw day and time", () => {
  assert.equal(wasteChecked(place()), "2026-10-20");
  assert.equal(
    wasteLine(wasteChecked(place())),
    "Wywozy sprawdziliśmy: 20 października",
  );
  // The source row says no more than its link and part: one checked line.
  for (const row of wasteSources(place()))
    for (const part of row)
      assert.doesNotMatch(
        typeof part === "string" ? part : JSON.stringify(part),
        /sprawdz|Stan na/,
      );

  // The import's source_files.lastSeenAt: Warsaw day and time.
  const sources = [
    {
      label: "Sektor 1",
      url: null,
      checkedAt: "2026-10-20",
      seenAt: "2026-10-25T04:03:12.5+00:00",
    },
  ];
  const at = wasteChecked(place({ sources }));
  assert.ok(at instanceof Date);
  assert.equal(wasteLine(at), "Wywozy sprawdziliśmy: 25 października, 5:03");
});

test("checked line: the oldest of several sources, times and days alike; none without a date", () => {
  const sources = [
    { label: "Sektor 1", url: null, checkedAt: "2026-10-23", seenAt: null },
    {
      label: "Sektor 1, papier",
      url: null,
      checkedAt: "2026-09-30",
      seenAt: null,
    },
    { label: "Sektor 1, szkło", url: null, checkedAt: null, seenAt: null },
  ];
  assert.equal(
    wasteLine(wasteChecked(place({ sources }))),
    "Wywozy sprawdziliśmy: 30 września",
  );
  assert.equal(wasteChecked(place({ sources: [sources[2]] })), null);
  assert.equal(wasteChecked(place({ sources: [] })), null);

  // The oldest wins, times and days alike.
  const seen = (seenAt: string | null, checkedAt = "2026-10-01") => ({
    label: "Sektor",
    url: null,
    checkedAt,
    seenAt,
  });
  // Two times: the older one.
  assert.equal(
    wasteLine(
      wasteChecked(
        place({
          sources: [seen("2026-10-25T04:03:00Z"), seen("2026-10-24T04:01:00Z")],
        }),
      ),
    ),
    "Wywozy sprawdziliśmy: 24 października, 6:01",
  );
  // A file seen today, another source without a row checked days ago.
  assert.equal(
    wasteLine(
      wasteChecked(
        place({
          sources: [seen("2026-10-25T04:03:00Z"), seen(null, "2026-10-20")],
        }),
      ),
    ),
    "Wywozy sprawdziliśmy: 20 października",
  );
  // A day counts as older than any time on that Warsaw day, and the day
  // is Warsaw's: 23:30 UTC on the 24th is already the 25th there.
  assert.equal(
    wasteChecked(
      place({
        sources: [seen("2026-10-24T23:30:00Z"), seen(null, "2026-10-25")],
      }),
    ),
    "2026-10-25",
  );
  assert.equal(
    wasteLine(
      wasteChecked(
        place({
          sources: [seen("2026-10-24T21:30:00Z"), seen(null, "2026-10-25")],
        }),
      ),
    ),
    "Wywozy sprawdziliśmy: 24 października, 23:30",
  );
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
