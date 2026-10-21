import assert from "node:assert/strict";
import { test } from "node:test";
import { extractJson } from "../core/vision.ts";
import {
  compareMembers,
  compareReadings,
  fold,
  MIASTO_ROWS,
  parseGminaLayout,
  parseVisionJson,
  polishHolidays,
  rowsToEvents,
  streetKey,
  streetReview,
  validateSchedule,
} from "./lib.ts";

const ROWS = Object.keys(MIASTO_ROWS);
const ALL = new Set(["year", "weekday", "counts"]);
const RULES = {
  weekdayShare: 0.6,
  holidayWindowDays: 6,
  counts: { factor: 0.5, slack: 2 },
};
const empty = () => Array.from({ length: 12 }, () => [] as number[]);
const reading = (
  patch: (rows: Record<string, number[][]>) => void = () => {},
) => {
  const rows = Object.fromEntries(ROWS.map((r) => [r, empty()]));
  rows.bio[0] = [5, 19];
  patch(rows);
  return { sector: 1, year: 2026, streets: ["Adama Asnyka"], rows };
};

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

test("gmina layout: places, three columns, '-' and '2,20'", () => {
  const months = [
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
  const text = [
    "MIEJSCOWOŚCI     MIESIĄC   ZMIESZANE   SELEKTYWNE   GABARYTY",
    ...months.map(
      (m, i) =>
        `${i === 0 ? "Dąbrowa, Basznia" : "        "}   ${m}   5,19   12   ${i === 0 ? "-" : "7"}`,
    ),
    "WSZYSTKIE",
  ].join("\n");
  const { places, rows } = parseGminaLayout(text);
  assert.deepEqual(places, ["Dąbrowa", "Basznia"]);
  assert.deepEqual(rows["zmieszane+bio"][0], [5, 19]);
  assert.deepEqual(rows.wielkogabarytowe[0], []);
  assert.throws(
    () => parseGminaLayout(text.replace("LUTY", "LUTEGO")),
    /missing months: LUTY/,
  );
});

test("vision JSON must match the schema exactly", () => {
  assert.equal(
    parseVisionJson(JSON.stringify(reading()), ROWS).rows.bio[0].join(),
    "5,19",
  );
  assert.throws(
    () => parseVisionJson(JSON.stringify({ ...reading(), note: 1 }), ROWS),
    /keys/,
  );
  assert.throws(
    () =>
      parseVisionJson(
        JSON.stringify(
          reading((r) => {
            r.bio[0] = [32];
          }),
        ),
        ROWS,
      ),
    /1–31/,
  );
  assert.throws(() => parseVisionJson("not json", ROWS));
});

test("vision JSON is found inside prose and fences", () => {
  const json = JSON.stringify(reading());
  for (const text of [
    `I'll read the schedule image and return only the JSON.${json}`,
    `${json}\nDone: every row read.`,
    `Here it is:\n\`\`\`json\n${json}\n\`\`\`\nAnything else?`,
  ])
    assert.equal(parseVisionJson(text, ROWS).rows.bio[0].join(), "5,19");
  const tricky = '{"a": "} {", "b": "say \\"}\\" twice", "c": {"d": [1]}}';
  assert.equal(extractJson(`x ${tricky} {"next": 1}`), tricky);
  assert.throws(() => extractJson("No JSON here, sorry."), /no JSON object/);
  assert.throws(() => extractJson('Cut off: {"a": "}'), /not closed/);
  assert.throws(() => parseVisionJson("not json", ROWS), /no JSON object/);
});

test("readings agree only when identical", () => {
  const a = parseVisionJson(JSON.stringify(reading()), ROWS);
  assert.deepEqual(compareReadings(a, a), []);
  const b = parseVisionJson(
    JSON.stringify(
      reading((r) => {
        r.bio[0] = [5, 20];
      }),
    ),
    ROWS,
  );
  assert.deepEqual(compareReadings(a, b), ["bio, styczeń: [5, 19] vs [5, 20]"]);
  // Streets are for the database check, not for agreement.
  assert.deepEqual(compareReadings(a, { ...a, streets: ["Inna"] }), []);
  assert.deepEqual(compareReadings(a, { ...a, sector: 2 }), ["sector: 1 vs 2"]);
});

test("streets: each pass against the database, spelling folded only", () => {
  const members = [
    { id: "a", names: ["Płk. Jana Lisa"] },
    { id: "b", names: ["Łążek"] },
    { id: "c", names: ["Sudel"] },
    { id: "d", names: ["Mazury"] },
    { id: "e", names: ["Boczna Mazury"] },
  ];
  const db = ["Płk. Jana Lisa", "Łążek", "Sudel", "Mazury", "Boczna Mazury"];
  assert.deepEqual(
    streetReview(
      "z",
      [db, ["Plk. Jana Lisa", "Łązek", "Sudeł", "Mazury", "Boczna Mazury"]],
      members,
    ),
    [],
  );
  assert.deepEqual(
    streetReview(
      "z",
      [
        [...db, "Jana Jeziorańskiego"],
        [...db.slice(1), "Jana Jeziorskiego"],
      ],
      [...members, { id: "f", names: ["Jana Jeziorańskiego"] }],
    ),
    [
      "z: „Jana Jeziorskiego” is not a member now (pass 2)",
      "z: „Płk. Jana Lisa” is no longer listed (pass 2)",
      "z: „Jana Jeziorańskiego” is no longer listed (pass 2)",
    ],
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

test("members: a vanished or unknown street is a problem", () => {
  const members = [
    { id: "a", names: ["Józefa Conrada-Korzeniowskiego"] },
    { id: "b", names: ["Rynek"] },
  ];
  assert.deepEqual(
    compareMembers(
      "z",
      ["ul. Józefa Conrada-Korzeniowskiego", "Rynek"],
      members,
      streetKey,
    ),
    [],
  );
  assert.deepEqual(compareMembers("z", ["Rynek", "Nowa"], members, streetKey), [
    "z: „Nowa” is not a member now",
    "z: „Józefa Conrada-Korzeniowskiego” is no longer listed",
  ]);
  assert.equal(fold("Łąka Górna"), "laka gorna");
});
