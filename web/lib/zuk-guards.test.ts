import assert from "node:assert/strict";
import { test } from "node:test";
import type { AiItem } from "./zuk-ai.ts";
import { AI_ITEM, reading } from "./zuk-fixture.ts";
import {
  checkWhen,
  houseScope,
  quoted,
  timeInText,
  type When,
} from "./zuk-guards.ts";

const item = (over: Partial<AiItem>): AiItem => ({
  date: "2026-10-27",
  start: "08:00",
  end: "16:00",
  locality: "Lisie Jamy",
  locality_verbatim: "Lisie Jamy",
  street: "Polna",
  street_verbatim: "ul. Polna",
  note: null,
  kind: "planned",
  ...AI_ITEM,
  ...over,
});

const POLNA =
  "Przerwa w dostawie wody – 27.10.2026\nw dniu 27.10.2026r. (wtorek) w godz. od 8:00 do godz. 16:00 nastąpi przerwa w dostawie wody dla mieszkańców miejscowości: Lisie Jamy: ul. Polna.";

const check = (i: AiItem, text = POLNA, posted = "2026-10-26 14:00:00") =>
  checkWhen(i, { text, publishedAt: posted, updatedAt: posted, pieces: [] });

function passes(result: When | string): When {
  assert.equal(typeof result, "object", `rejected: ${result}`);
  return result as When;
}

test("time: literal as 8:00, 08:00 or 8.00, never another hour", () => {
  assert.ok(timeInText("08:00", "w godz. od 8:00 do godz. 16:00"));
  assert.ok(timeInText("09:00", "w godzinach 9.00 – 15.00"));
  assert.ok(
    timeInText("19:00", "Przewidywane wznowienie dostawy do godz. 19.00."),
  );
  assert.ok(!timeInText("08:00", "od 18:00"));
  assert.ok(!timeInText("16:30", "do godz. 16:00"));
});

test("item: Warsaw wall clock start and end", () => {
  const ok = passes(check(item({})));
  assert.equal(ok.start, "2026-10-27 08:00:00");
  assert.equal(ok.end, "2026-10-27 16:00:00");
  assert.equal(ok.endEstimated, false);
});

test("item: a time not in the text", () => {
  assert.equal(check(item({ end: "15:00" })), "time");
  assert.equal(check(item({ start: "8:00" })), "time");
  assert.equal(check(item({ start: "24:00" }), `${POLNA} 24:00`), "time");
});

test("item: a night cut ends the next day (35690)", () => {
  const text =
    "Planowana przerwa: Lisie Jamy (noc 21/22 grudnia)\nw nocy z 21.12.2025r.(niedziela) na 22.12.2025r.(poniedziałek) w godz. od 22:00 do godz. 5:00 nastąpi przerwa w dostawie wody dla mieszkańców miejscowości Lisie Jamy, Wólka Krowicka.";
  const ok = passes(
    checkWhen(reading(35690).items[0], {
      text,
      publishedAt: "2025-12-19 14:48:38",
      updatedAt: "2025-12-29 14:26:47",
      pieces: quoted(reading(35690).items[0]),
    }),
  );
  assert.equal(ok.start, "2025-12-21 22:00:00");
  assert.equal(ok.end, "2025-12-22 05:00:00");
});

test("item: any end before the start is the next day; never the start", () => {
  const text = `${POLNA} od 16:00 do 8:00`;
  const ok = passes(check(item({ start: "16:00", end: "08:00" }), text));
  assert.equal(ok.end, "2026-10-28 08:00:00");
  assert.equal(check(item({ start: "08:00", end: "08:00" })), "time");
});

test("item: the end an estimate only as the model reads it (35661)", () => {
  const text =
    "w dniu 16.12.2025 (wtorek) w miejscowościach Lisie Jamy, Wólka Krowicka nastąpiła czasowa przerwa w dostawie wody.\nPrzewidywane wznowienie dostawy do godz. 19.00.";
  const ok = passes(
    checkWhen(reading(35661).items[0], {
      text,
      publishedAt: "2025-12-16 16:01:29",
      updatedAt: "2025-12-19 14:46:40",
      pieces: quoted(reading(35661).items[0]),
    }),
  );
  assert.equal(ok.start, null);
  assert.equal(ok.end, "2025-12-16 19:00:00");
  assert.equal(ok.endEstimated, true);
  assert.equal(
    passes(check(item({ end_estimated: true, end: null }))).endEstimated,
    false,
  );
  assert.equal(passes(check(item({ kind: "emergency" }))).endEstimated, false);
});

test("times: from the item's own lines, or from lines that quote no item", () => {
  // Two groups with hours of their own, the day on a line of its own.
  const text = [
    "Przerwa w dostawie wody – 21.10.2026",
    "w dniu: 21.10.2026r. (środa) nastąpi przerwa w dostawie wody:",
    "Przykładów, Wzorowo od nr 1 do nr 9 w godz. – od 8:00 do 12:00",
    "Testowo, Próbno – od 8:00 do 16:00",
  ].join("\n");
  const testowo = item({
    date: "2026-10-21",
    locality: "Testowo",
    locality_verbatim: "Testowo",
    street: null,
    street_verbatim: null,
  });
  const wzorowo = {
    ...testowo,
    locality: "Wzorowo",
    locality_verbatim: "Wzorowo",
    note: "od nr 1 do nr 9",
  };
  const ctx = {
    text,
    publishedAt: "2026-10-20 11:00:00",
    updatedAt: "2026-10-20 11:00:00",
    pieces: [...quoted(testowo), ...quoted(wzorowo)],
  };
  assert.equal(typeof checkWhen(testowo, ctx), "object");
  // Another group's hours: never this item's.
  assert.equal(checkWhen({ ...testowo, end: "12:00" }, ctx), "time");
  assert.equal(typeof checkWhen({ ...wzorowo, end: "12:00" }, ctx), "object");
  assert.equal(checkWhen(wzorowo, ctx), "time");
  // The hours for all on the opening line, the places listed below.
  const list = [
    "Przerwa w dostawie wody",
    "w dniu 21 października w godzinach 08.30 – 15.00 nastąpi przerwa przy ulicach:",
    "Próbnej",
    "Wzorcowej",
  ].join("\n");
  const probna = {
    ...testowo,
    start: "08:30",
    end: "15:00",
    locality_verbatim: null,
    street: "Próbna",
    street_verbatim: "Próbnej",
  };
  assert.equal(
    typeof checkWhen(probna, {
      ...ctx,
      text: list,
      pieces: [...quoted(probna), "Wzorcowej"],
    }),
    "object",
  );
});

test("item: a day far from the post's dates", () => {
  const text = POLNA.replaceAll("27.10.2026r. (wtorek)", "27.12.2026r.");
  assert.equal(check(item({ date: "2026-12-27" }), text), "date");
  assert.equal(check(item({ date: "2026-10-24" })), "date");
  assert.equal(typeof check(item({ date: "2026-10-25" })), "object");
});

test("scope: the houses, each written in the note, else the whole place", () => {
  assert.deepEqual(houseScope(null, []), { type: "whole" });
  assert.deepEqual(
    houseScope("numery: od 1 do 15 i od 16 do 54", [
      { from: "1", to: "15" },
      { from: "16", to: "54" },
    ]),
    {
      type: "ranges",
      ranges: [
        { from: "1", to: "15" },
        { from: "16", to: "54" },
      ],
    },
  );
  assert.deepEqual(
    houseScope("Podłęże od numeru 44 do numeru 92", [{ from: "44", to: "92" }]),
    { type: "ranges", ranges: [{ from: "44", to: "92" }] },
  );
  assert.deepEqual(houseScope("nr 104", [{ from: "104", to: "104" }]), {
    type: "numbers",
    numbers: ["104"],
  });
  assert.deepEqual(
    houseScope("nr 34A i 36", [
      { from: "34A", to: "34A" },
      { from: "36", to: "36" },
    ]),
    { type: "numbers", numbers: ["34A", "36"] },
  );
  // A single house among ranges is a range of one.
  assert.deepEqual(
    houseScope("od nr 1 do nr 5 i nr 9", [
      { from: "1", to: "5" },
      { from: "9", to: "9" },
    ]),
    {
      type: "ranges",
      ranges: [
        { from: "1", to: "5" },
        { from: "9", to: "9" },
      ],
    },
  );
});

test("scope: houses not certain from the note are houses unknown", () => {
  const unknown = { type: "unknown" };
  const cases: Array<[string | null, AiItem["houses"]]> = [
    // An open range, a reversed one.
    ["od numeru 44", [{ from: "44", to: null }]],
    ["od nr 110 do nr 104", [{ from: "110", to: "104" }]],
    // A number not in the note, or only inside another one.
    ["od nr 104 do nr 110", [{ from: "104", to: "111" }]],
    ["od nr 104 do nr 110", [{ from: "10", to: "110" }]],
    ["nr 34A", [{ from: "34", to: "34" }]],
    // Not a house number.
    ["od nr 1 do nr 5", [{ from: "nr 1", to: "5" }]],
    // Houses without a note, a note without houses.
    [null, [{ from: "1", to: "5" }]],
    ["w części miejscowości", []],
    ["numery nieparzyste od 13 do 21", []],
  ];
  for (const [note, houses] of cases)
    assert.deepEqual(
      houseScope(note, houses),
      unknown,
      JSON.stringify([note, houses]),
    );
});
