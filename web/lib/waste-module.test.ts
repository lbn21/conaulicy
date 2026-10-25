import assert from "node:assert/strict";
import { test } from "node:test";
import type { PlaceView } from "./schedule.ts";
import { wasteSources, wasteSummary } from "./waste-module.ts";

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
  gmina: "Lubaczów (miasto)",
  zoneId: "zone-1",
  nr: null,
  askNumber: false,
  unknownNr: null,
  today: "2026-10-26",
  schedulePage: null,
  days: [
    { date: "2026-10-20", pickups: [pickup("Papier")] },
    {
      date: "2026-10-28",
      pickups: [pickup("Zmieszane", "06:00"), pickup("Bio")],
    },
  ],
  sources: [{ label: "Sektor 1", url: null, checkedAt: "2026-10-20" }],
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
    [
      "harmonogram Urzędu Miejskiego w Lubaczowie",
      ", Sektor 1",
      ", sprawdzono 20 października 2026",
    ],
  ]);
  const url = "https://example.org/a.pdf";
  assert.deepEqual(
    wasteSources(
      place({ sources: [{ label: "Sektor 2", url, checkedAt: null }] }),
    ),
    [
      [
        { href: url, text: "harmonogram Urzędu Miejskiego w Lubaczowie" },
        ", Sektor 2",
      ],
    ],
  );
});
