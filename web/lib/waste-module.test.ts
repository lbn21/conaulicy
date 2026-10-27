import assert from "node:assert/strict";
import { test } from "node:test";
import { checkedLine } from "./hub.ts";
import type { PlaceView } from "./schedule.ts";
import {
  sourcesOf,
  wasteChecked,
  wastePath,
  wasteSources,
  wasteSummary,
} from "./waste-module.ts";

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
  today: "2026-10-26",
  schedulePage: null,
  days: [
    { date: "2026-10-20", pickups: [pickup("Papier")] },
    {
      date: "2026-10-28",
      pickups: [pickup("Zmieszane", "06:00"), pickup("Bio")],
    },
  ],
  sources: [
    { label: "Sektor 1", url: null, checkedAt: "2026-10-20", seenAt: null },
  ],
  verified: true,
  ...overrides,
});

test("the card: the next pickup on or after today, absolute, its bins", () => {
  const rows = wasteSummary(place());
  assert.deepEqual(rows, [
    ["Najbliższy odbiór", ["środa, 28 października"]],
    ["Pojemniki", [{ bins: [pickup("Zmieszane", "06:00"), pickup("Bio")] }]],
    ["Wystaw", ["do 6:00 w dniu odbioru"]],
  ]);
});

test("no put-out row without a time; a note while unverified", () => {
  const rows = wasteSummary(
    place({
      days: [{ date: "2026-10-27", pickups: [pickup("Szkło")] }],
      verified: false,
    }),
  );
  assert.deepEqual(
    rows.map(([key]) => key),
    ["Najbliższy odbiór", "Pojemniki", "Uwaga"],
  );
  assert.deepEqual(rows[0], ["Najbliższy odbiór", ["wtorek, 27 października"]]);
});

test("unverified: one short sentence, the gmina's schedule linked", () => {
  const note = (overrides: Partial<PlaceView>) =>
    wasteSummary(place({ verified: false, ...overrides })).at(-1);
  const page = "https://example.org/harmonogram";
  const pdf = "https://example.org/a.pdf";
  const sentence = (link: string | { href: string; text: string }) => [
    "Uwaga",
    ["Daty odczytaliśmy automatycznie, sprawdź je w ", link, "."],
  ];
  assert.deepEqual(
    note({ schedulePage: page }),
    sentence({ href: page, text: "harmonogramie gminy" }),
  );
  assert.deepEqual(
    note({
      sources: [{ label: "Sektor 1", url: pdf, checkedAt: null, seenAt: null }],
    }),
    sentence({ href: pdf, text: "harmonogramie gminy" }),
  );
  assert.deepEqual(note({}), sentence("harmonogramie gminy"));
});

test("a split street without a number links the waste subpage's question", () => {
  const rows = wasteSummary(place({ askNumber: true, zoneId: null }));
  assert.deepEqual(rows, [
    [
      "Najbliższy odbiór",
      [
        "Na tej ulicy śmieciarka przyjeżdża w różne dni, zależnie od numeru. ",
        { href: "/adres/0972447-00470/smieci", text: "Podaj numer domu" },
      ],
    ],
  ]);
});

test("no dates: why, then the gmina's schedule, always a card", () => {
  const page = "https://example.org/harmonogram";
  const none = wasteSummary(
    place({ zoneId: null, days: [], schedulePage: page }),
  );
  assert.equal(none.length, 1);
  assert.match(String(none[0][1][0]), /^Tej ulicy jeszcze nie mamy\./);
  assert.deepEqual(none[0][1].at(-1), {
    href: page,
    text: "Otwórz harmonogram Urzędu Miejskiego w Lubaczowie",
  });
  const ended = wasteSummary(place({ today: "2026-11-01" }));
  assert.match(String(ended[0][1][0]), /^Nie mamy jeszcze kolejnych terminów/);
  assert.equal(ended[0][1].length, 1);
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
    checkedLine(wasteChecked(place())),
    "Ostatnio sprawdziliśmy: 20 października",
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
  assert.equal(
    checkedLine(at),
    "Ostatnio sprawdziliśmy: 25 października, 5:03",
  );
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
    checkedLine(wasteChecked(place({ sources }))),
    "Ostatnio sprawdziliśmy: 30 września",
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
    checkedLine(
      wasteChecked(
        place({
          sources: [seen("2026-10-25T04:03:00Z"), seen("2026-10-24T04:01:00Z")],
        }),
      ),
    ),
    "Ostatnio sprawdziliśmy: 24 października, 6:01",
  );
  // A file seen today, another source without a row checked days ago.
  assert.equal(
    checkedLine(
      wasteChecked(
        place({
          sources: [seen("2026-10-25T04:03:00Z"), seen(null, "2026-10-20")],
        }),
      ),
    ),
    "Ostatnio sprawdziliśmy: 20 października",
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
    checkedLine(
      wasteChecked(
        place({
          sources: [seen("2026-10-24T21:30:00Z"), seen(null, "2026-10-25")],
        }),
      ),
    ),
    "Ostatnio sprawdziliśmy: 24 października, 23:30",
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
