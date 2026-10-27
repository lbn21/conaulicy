import assert from "node:assert/strict";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";
import {
  checkReply,
  databaseRows,
  memberLists,
  parseReviewed,
  polishHolidays,
  readingTable,
  reviewedYaml,
  rowsToEvents,
  validateSchedule,
} from "./lib.ts";

const ALL = new Set(["year", "weekday", "counts"]);
const RULES = {
  weekdayShare: 0.6,
  holidayWindowDays: 6,
  counts: { factor: 0.5, slack: 2 },
};
const FILE = { sector: 1, year: 2026 };
const HEADERS = [
  "STYCZEŃ",
  "LUTY",
  "MARZEC",
  "KWIECIEŃ",
  "MAJ",
  "CZERWIEC",
  "LIPIEC",
  "SIERPIEŃ",
  "WRZESIEŃ",
  "PAŹDZIERNIK",
  "LISTOPAD",
  "GRUDZIEŃ",
];
const IDS = ["00470", "02974"];

/** A small city reply in the prompt's shape: January, two bands. */
const cityReply = () => ({
  sector: 1,
  year: 2026,
  months: [...HEADERS],
  places: [
    { as_written: "Adama Asnyka", id: "00470" } as {
      as_written: string;
      id: string | null;
    },
  ],
  rows: {
    "zmieszane+popiol": [
      { month: 1, month_header: "STYCZEŃ", above: null, day: 12 } as Record<
        string,
        unknown
      >,
      { month: 1, month_header: "STYCZEŃ", above: null, day: 26 },
    ],
    "papier+tworzywa_metale+szklo": [
      { month: 1, month_header: "STYCZEŃ", above: 12, day: 5 } as Record<
        string,
        unknown
      >,
    ],
    bio: [
      { month: 1, month_header: "STYCZEŃ", above: 5, day: 7 } as Record<
        string,
        unknown
      >,
    ],
    "wielkogabarytowe+elektro+opony+tekstylia": [] as unknown[],
  },
  unplaced: [] as unknown[],
});
const city = (reply: unknown) =>
  checkReply(JSON.stringify(reply), "miasto", IDS, FILE);

test("Polish holidays include the moving feasts", () => {
  const days = polishHolidays(2026);
  for (const d of [
    "2026-04-05",
    "2026-04-06",
    "2026-05-24",
    "2026-06-04",
    "2026-12-24",
  ])
    assert.ok(days.has(d), d);
  assert.ok(!polishHolidays(2024).has("2024-12-24"));
});

test("reply: a sound reading has no findings; rows by month, as printed", () => {
  const { reading, findings } = city(cityReply());
  assert.deepEqual(findings, []);
  assert.deepEqual(reading?.rows["zmieszane+popiol"][0], [12, 26]);
  assert.deepEqual(reading?.rows.bio[0], [7]);
  assert.deepEqual(reading?.rows.bio[1], []);
  assert.deepEqual(reading?.places, [
    { as_written: "Adama Asnyka", id: "00470" },
  ]);
  assert.deepEqual(reading?.months, HEADERS);
});

test("reply: anything but the JSON as given is not JSON", () => {
  const json = JSON.stringify(cityReply());
  for (const content of [
    `I'll read the schedule.${json}`,
    `\`\`\`json\n${json}\n\`\`\``,
    "",
    "Sorry, I cannot read this image.",
  ])
    assert.deepEqual(checkReply(content, "miasto", IDS, FILE), {
      reading: null,
      findings: ["reply is not JSON"],
    });
});

test("reply: an id not in the list sent, an empty name", () => {
  const reply = cityReply();
  reply.places.push({ as_written: "Osiedle Testowe", id: "90101" });
  reply.places.push({ as_written: "", id: null });
  assert.deepEqual(city(reply).findings, [
    'places[1] "Osiedle Testowe": id "90101" is not in the list sent',
    "places[2]: as_written is empty",
  ]);
});

test("reply: month_header must be months[month - 1], literally", () => {
  const reply = cityReply();
  reply.rows.bio[0].month_header = "Styczeń";
  assert.deepEqual(city(reply).findings, [
    'bio, month 1, day 7: month_header "Styczeń" is not months[0] "STYCZEŃ"',
  ]);
  const shifted = cityReply();
  shifted.months[0] = "STYCZEN";
  assert.equal(city(shifted).findings.length, 4);
});

test("reply: city above is a date of the band above in that month, null on top", () => {
  const reply = cityReply();
  reply.rows.bio[0].above = 6;
  reply.rows["zmieszane+popiol"][0].above = 3;
  assert.deepEqual(city(reply).findings, [
    "zmieszane+popiol, month 1, day 12: above is 3 in the top band",
    "bio, month 1, day 7: above 6 is not a date of papier+tworzywa_metale+szklo in that month",
  ]);
  // Another month's 5 is not the band above's date in January.
  const other = cityReply();
  other.rows["papier+tworzywa_metale+szklo"][0].month = 2;
  other.rows["papier+tworzywa_metale+szklo"][0].month_header = "LUTY";
  other.rows["papier+tworzywa_metale+szklo"][0].above = null;
  assert.deepEqual(city(other).findings, [
    "bio, month 1, day 7: above 5 is not a date of papier+tworzywa_metale+szklo in that month",
  ]);
});

test("reply: exact keys: no above in the city, an extra key, a missing row", () => {
  const noAbove = cityReply();
  delete noAbove.rows["papier+tworzywa_metale+szklo"][0].above;
  assert.deepEqual(city(noAbove), {
    reading: null,
    findings: ['rows.papier+tworzywa_metale+szklo[0]: no key "above"'],
  });
  const extra = { ...cityReply(), streets: [] };
  assert.deepEqual(city(extra).findings, ['reply: unexpected key "streets"']);
  const row = cityReply() as { rows: Record<string, unknown> };
  delete row.rows.bio;
  assert.deepEqual(city(row).findings, ['rows: no key "bio"']);
  // A gmina entry has no above.
  const gmina = {
    ...cityReply(),
    sector: null,
    rows: {
      "zmieszane+bio": [
        { month: 1, month_header: "STYCZEŃ", above: null, day: 5 },
      ],
      selektywne: [],
      wielkogabarytowe: [],
    },
  };
  assert.deepEqual(
    checkReply(JSON.stringify(gmina), "gmina", ["0606010"], FILE).findings,
    ['rows.zmieszane+bio[0]: unexpected key "above"'],
  );
});

test("reply: sector null for the gmina, the file's for the city; the year", () => {
  const gmina = {
    sector: 1,
    year: 2027,
    months: HEADERS,
    places: [{ as_written: "DĄBROWA", id: "0606010" }],
    rows: { "zmieszane+bio": [], selektywne: [], wielkogabarytowe: [] },
    unplaced: [],
  };
  assert.deepEqual(
    checkReply(JSON.stringify(gmina), "gmina", ["0606010"], FILE).findings,
    [
      "sector 1, expected null (the gmina PDFs print no sector)",
      "year 2027, the file name says 2026",
    ],
  );
  assert.deepEqual(city({ ...cityReply(), sector: 2 }).findings, [
    "sector 2, the file name says 1",
  ]);
  assert.deepEqual(city({ ...cityReply(), sector: null }).findings, [
    "sector null, the file name says 1",
  ]);
});

test("reply: a date not placed is a finding, shown as returned", () => {
  const reply = cityReply();
  reply.unplaced.push({ row: "bio", day: 21 });
  assert.deepEqual(city(reply).findings, ['unplaced: "bio", day 21']);
  assert.deepEqual(city(reply).reading?.unplaced, [{ row: "bio", day: 21 }]);
});

test("members by id: on the file only, in the zone only, no id", () => {
  assert.deepEqual(
    memberLists(
      [
        { as_written: "Adama Asnyka", id: "00470" },
        { as_written: "Nowa", id: "14330" },
        { as_written: "Os. Nowe", id: null },
      ],
      [
        { id: "00470", name: "Adama Asnyka" },
        { id: "02974", name: "Cicha" },
      ],
    ),
    {
      notInZone: [{ as_written: "Nowa", id: "14330" }],
      notOnFile: [{ id: "02974", name: "Cicha" }],
      noId: [{ as_written: "Os. Nowe", id: null }],
    },
  );
});

test("validation: weekday per row, holiday shifts, year, counts", () => {
  const src = { doc: "d", url: "u", sha256: "s" };
  // Mondays, plus Tuesday 7 April (Easter Monday week) and Wednesday 4 March.
  const rows = {
    bio: [[5, 19], [], [2, 4], [7, 20], ...Array.from({ length: 8 }, () => [])],
  };
  const { events } = rowsToEvents("z", 2026, rows, { bio: ["bio"] }, src);
  const problems = validateSchedule({
    zoneId: "z",
    year: 2026,
    events,
    checks: ALL,
    rules: RULES,
    previous: null,
    anomalies: new Set(),
  });
  assert.deepEqual(problems, [
    "z: 2026-03-04 (bio) is not on the row's usual weekday and no public holiday explains it",
  ]);
  const approved = validateSchedule({
    zoneId: "z",
    year: 2026,
    events,
    checks: ALL,
    rules: RULES,
    previous: null,
    anomalies: new Set(["z|2026-03-04"]),
  });
  assert.deepEqual(approved, []);
  const counts = validateSchedule({
    zoneId: "z",
    year: 2026,
    events,
    checks: ALL,
    rules: RULES,
    previous: new Map([["bio", 26]]),
    anomalies: new Set(["z|2026-03-04"]),
  });
  assert.match(counts[0], /bio 6 dates, 26 last year/);
  assert.deepEqual(
    rowsToEvents("z", 2026, { bio: [[31], [30]] }, { bio: ["bio"] }, src)
      .problems,
    ["bio: 30.2.2026 is not a date"],
  );
});

test("review PRs: the table, the reviewed file with places, round trip", () => {
  const reply = cityReply();
  reply.rows.bio.push({
    month: 3,
    month_header: "MARZEC",
    above: null,
    day: 31,
  });
  const { reading } = city(reply);
  assert.ok(reading);
  const current = databaseRows(
    [
      { subtype: "bio", start: "2026-01-07" },
      { subtype: "zmieszane", start: "2026-01-12" },
      { subtype: "zmieszane", start: "2026-01-26" },
      { subtype: "papier", start: "2026-01-05" },
      { subtype: "bio", start: "2026-03-17" },
    ],
    {
      "zmieszane+popiol": ["zmieszane"],
      "papier+tworzywa_metale+szklo": ["papier"],
      bio: ["bio"],
      "wielkogabarytowe+elektro+opony+tekstylia": ["wielkogabarytowe"],
    },
  );
  const table = readingTable(reading, current).split("\n");
  assert.equal(table.length, 2 + 4 * 12);
  assert.equal(
    table[0],
    "| Wiersz | Miesiąc | Nagłówek z odczytu | odczyt | w bazie | |",
  );
  assert.ok(table.includes("| bio | styczeń | STYCZEŃ | 7 | 7 |  |"));
  assert.ok(
    table.includes("| bio | marzec | MARZEC | 31 | 17 | **różnica** |"),
  );
  assert.ok(table.includes("| bio | kwiecień | KWIECIEŃ | — | — |  |"));
  const file = { name: "harmonogram-2026-s1.jpg", ...FILE };
  const yaml = reviewedYaml(reading, "miasto", file, "grok-4.7", "ab12");
  assert.match(yaml, /^ {4}marzec: \[31\]$/m);
  assert.match(yaml, /^ {2}- \{ as_written: "Adama Asnyka", id: "00470" \}$/m);
  assert.match(yaml, /przynależność do stref bierze się wyłącznie z bazy/);
  const value = parseYaml(yaml);
  assert.equal(value.sha256, "ab12");
  assert.equal(value.from, "grok-4.7");
  const back = parseReviewed(value, "miasto", IDS, FILE);
  assert.deepEqual(back.findings, []);
  assert.deepEqual(back.reading?.rows, reading.rows);
  assert.deepEqual(back.reading?.places, reading.places);
  // The same literal checks: a day that is not an integer, an id off the list.
  value.rows.bio.marzec = [3, "17"];
  value.places[0].id = "99999";
  assert.deepEqual(parseReviewed(value, "miasto", IDS, FILE).findings, [
    'places[0] "Adama Asnyka": id "99999" is not in the list sent',
    "rows.bio.marzec: not a list of integer days",
  ]);
  // No reading (a reply without the shape): the file's sector and year, no dates.
  const blank = parseYaml(
    reviewedYaml(null, "gmina", file, "grok-4.7", "ab12"),
  );
  assert.equal(blank.sector, null);
  assert.equal(blank.year, 2026);
  assert.deepEqual(blank.places, []);
  assert.deepEqual(blank.rows.selektywne.styczeń, []);
});
