import assert from "node:assert/strict";
import { test } from "node:test";
import type { AiItem } from "./zuk-ai.ts";
import { REAL_TEXTS, reading } from "./zuk-fixture.ts";
import {
  checkOmission,
  checkWhen,
  noteScope,
  timeInText,
  type When,
} from "./zuk-guards.ts";

const textOf = (id: number) => {
  const n = REAL_TEXTS.find((t) => t.id === id);
  assert.ok(n, `no post ${id}`);
  return `${n.title}\n${n.text}`;
};

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
  ...over,
});

const POLNA =
  "Przerwa w dostawie wody – 27.10.2026\nw dniu 27.10.2026r. (wtorek) w godz. od 8:00 do godz. 16:00 nastąpi przerwa w dostawie wody dla mieszkańców miejscowości: Lisie Jamy: ul. Polna.";

const check = (i: AiItem, text = POLNA, posted = "2026-10-26 14:00:00") =>
  checkWhen(i, { text, publishedAt: posted, updatedAt: posted });

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
  assert.match(
    check(item({ end: "15:00" })) as string,
    /15:00 not in the text/,
  );
});

test("item: a night cut ends the next day (35690)", () => {
  const text =
    "Planowana przerwa: Lisie Jamy (noc 21/22 grudnia)\nw nocy z 21.12.2025r.(niedziela) na 22.12.2025r.(poniedziałek) w godz. od 22:00 do godz. 5:00 nastąpi przerwa w dostawie wody dla mieszkańców miejscowości Lisie Jamy, Wólka Krowicka.";
  const ok = passes(
    checkWhen(reading(35690).items[0], {
      text,
      publishedAt: "2025-12-19 14:48:38",
      updatedAt: "2025-12-29 14:26:47",
    }),
  );
  assert.equal(ok.start, "2025-12-21 22:00:00");
  assert.equal(ok.end, "2025-12-22 05:00:00");
});

test("item: an end before the start in the day", () => {
  const text = `${POLNA} od 16:00 do 8:00`;
  assert.match(
    check(item({ start: "16:00", end: "08:00" }), text) as string,
    /ends 08:00 before it starts 16:00/,
  );
});

test("item: an emergency's end is an estimate, no start given (35661)", () => {
  const text =
    "w dniu 16.12.2025 (wtorek) w miejscowościach Lisie Jamy, Wólka Krowicka nastąpiła czasowa przerwa w dostawie wody.\nPrzewidywane wznowienie dostawy do godz. 19.00.";
  const ok = passes(
    checkWhen(reading(35661).items[0], {
      text,
      publishedAt: "2025-12-16 16:01:29",
      updatedAt: "2025-12-19 14:46:40",
    }),
  );
  assert.equal(ok.start, null);
  assert.equal(ok.end, "2025-12-16 19:00:00");
  assert.equal(ok.endEstimated, true);
});

test("item: a day far from the post's dates", () => {
  const text = POLNA.replaceAll("27.10.2026r. (wtorek)", "27.12.2026r.");
  assert.match(
    check(item({ date: "2026-12-27" }), text) as string,
    /too far from the post's date/,
  );
});

test("omission: house numbers left out, with no note (39766)", () => {
  const text = textOf(39766);
  assert.match(
    checkOmission("Wólka Krowicka", "Wólka Krowicka", [], [], text) ?? "",
    /leaves out/,
  );
  // "od 8:00" after a place is the time, not a house range.
  assert.equal(checkOmission("Podlesie", "Podlesie", [], [], text), null);
});

test("omission: a bracket left out ('(przysiółek Dąbrowa)', 39699)", () => {
  assert.match(
    checkOmission("Basznia Górna", "Basznia Górna", [], [], textOf(39699)) ??
      "",
    /leaves out/,
  );
});

test("omission: 'w części' before the place (26028)", () => {
  const text = textOf(26028);
  assert.match(
    checkOmission("Bałaje", "Bałaje", [], [], text) ?? "",
    /leaves out/,
  );
  // Fine when another item of Bałaje has that qualifier as its note.
  assert.equal(
    checkOmission("Bałaje", "Bałaje", [], ["w części miejscowości"], text),
    null,
  );
  // Another note, elsewhere, does not cover it.
  assert.match(
    checkOmission("Bałaje", "Bałaje", [], ["od nr 1 do nr 5"], text) ?? "",
    /leaves out/,
  );
});

test("omission: a street of the next place is not this place's", () => {
  // 39885: "Bałaje, ul. Przemysłowa (Lubaczów)".
  const text =
    "-28.10.2026 (środa): Załuże–Podłęże od numeru 44 do numeru 92, Bałaje, ul. Przemysłowa (Lubaczów), Antoniki – w godz. od 8:00 do 16:00";
  assert.equal(
    checkOmission("Bałaje", "Bałaje", ["ul. Przemysłowa"], [], text),
    null,
  );
  assert.match(
    checkOmission("Bałaje", "Bałaje", [], [], text) ?? "",
    /leaves out/,
  );
});

test("omission: a village never named on its own (39495)", () => {
  // Only "Lisie Jamy: ul. Polna" is in the text: all of Lisie Jamy is not.
  assert.match(
    checkOmission("Lisie Jamy", "Lisie Jamy", [], [], textOf(39495)) ?? "",
    /leaves out|not named on its own/,
  );
});

test("scope: house ranges or numbers from the note, else the whole place", () => {
  assert.deepEqual(noteScope(null), {
    scope: { type: "whole" },
    hamlet: null,
  });
  assert.deepEqual(noteScope("numery: od 1 do 15 i od 16 do 54"), {
    scope: {
      type: "ranges",
      ranges: [
        { from: "1", to: "15" },
        { from: "16", to: "54" },
      ],
    },
    hamlet: null,
  });
  assert.deepEqual(noteScope("od nr 104 do nr 110"), {
    scope: { type: "ranges", ranges: [{ from: "104", to: "110" }] },
    hamlet: null,
  });
  assert.deepEqual(noteScope("nr 104"), {
    scope: { type: "numbers", numbers: ["104"] },
    hamlet: null,
  });
});

test("scope: a hamlet in the note", () => {
  assert.deepEqual(
    noteScope("od numeru 121 do numeru 144 (przysiółek Dąbrowa)"),
    {
      scope: { type: "ranges", ranges: [{ from: "121", to: "144" }] },
      hamlet: "dąbrowa",
    },
  );
});

test("scope: anything else in the note is part of the place, houses unknown", () => {
  for (const note of [
    "w części miejscowości",
    "gospodarstwa zasilane z SUW Mokrzyca",
    "numery nieparzyste od 13 do 21 oraz numery parzyste od 2 do 82",
    "Podłęże od numeru 44 do numeru 92",
    "od numeru 263 (Wygon)",
  ])
    assert.deepEqual(
      noteScope(note),
      { scope: { type: "unknown" }, hamlet: null },
      note,
    );
});

test("scope: a backward range, or ranges and numbers, are rejected", () => {
  assert.match(noteScope("od nr 110 do nr 104") as string, /runs backwards/);
  assert.match(
    noteScope("od nr 1 do nr 5 i nr 9") as string,
    /ranges and numbers/,
  );
});
