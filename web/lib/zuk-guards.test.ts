import assert from "node:assert/strict";
import { test } from "node:test";
import type { AiItem } from "./zuk-ai.ts";
import { REAL_TEXTS, reading } from "./zuk-fixture.ts";
import {
  type Checked,
  checkDate,
  checkItem,
  checkOmission,
  deriveScope,
  timeInText,
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
  street: "Polna",
  place_verbatim: "Lisie Jamy: ul. Polna",
  note: null,
  kind: "planned",
  ...over,
});

const POLNA =
  "Przerwa w dostawie wody – 27.10.2026\nw dniu 27.10.2026r. (wtorek) w godz. od 8:00 do godz. 16:00 nastąpi przerwa w dostawie wody dla mieszkańców miejscowości: Lisie Jamy: ul. Polna.";

const check = (
  i: AiItem,
  text = POLNA,
  others = [i.place_verbatim],
  posted = "2026-10-26 14:00:00",
) => checkItem(i, { text, others, publishedAt: posted, updatedAt: posted });

function passes(result: Checked | string): Checked {
  assert.equal(typeof result, "object", `rejected: ${result}`);
  return result as Checked;
}

test("date: the day and month in the text, with or without a year", () => {
  assert.equal(checkDate("2026-10-27", "w dniu 27.10.2026r. (wtorek)"), null);
  assert.equal(checkDate("2026-10-27", "w dniu 27.10 (wtorek)"), null);
  assert.equal(
    checkDate("2026-09-07", "w dniach: 07.09.2026r.(poniedziałek)"),
    null,
  );
  assert.match(checkDate("2026-10-28", POLNA) ?? "", /not in the text/);
  // 1.10 is not inside 21.10, nor 2.1 inside 2.10.
  assert.match(checkDate("2026-10-01", "21.10.2026") ?? "", /not in the text/);
  assert.match(checkDate("2026-01-02", "2.10.2026") ?? "", /not in the text/);
});

test("date: a year in the text must be the item's year", () => {
  assert.match(checkDate("2025-10-27", POLNA) ?? "", /not in the text/);
});

test("date: no such day", () => {
  assert.match(checkDate("2026-02-30", "30.02.2026") ?? "", /no such date/);
});

test("weekday: a written weekday must match the date", () => {
  assert.match(
    checkDate("2026-10-27", "w dniu 27.10.2026r. (środa)") ?? "",
    /is a wtorek, text says środa/,
  );
  assert.equal(checkDate("2026-10-28", "28.10.2026 (środa)"), null);
  // A bracket that is not a weekday is not checked.
  assert.equal(checkDate("2026-10-27", "27.10.2026 (Lubaczów)"), null);
});

test("range: days inside 'od D.M.Y do D.M.Y' are in the text (23860)", () => {
  const text = textOf(23860);
  for (const day of ["06", "07", "08", "09", "10"])
    assert.equal(checkDate(`2023-11-${day}`, text), null, day);
  assert.match(checkDate("2023-11-05", text) ?? "", /not in the text/);
  assert.match(checkDate("2023-11-11", text) ?? "", /not in the text/);
});

test("range: with weekdays, and a year only at the end", () => {
  assert.equal(
    checkDate("2026-10-27", "od 26.10.2026r. (poniedziałek) do 29.10.2026r."),
    null,
  );
  assert.equal(checkDate("2026-10-28", "od 26.10 do 29.10.2026"), null);
});

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
  assert.deepEqual(ok.scope, { type: "whole" });
});

test("item: a time not in the text", () => {
  assert.match(
    check(item({ end: "15:00" })) as string,
    /15:00 not in the text/,
  );
});

test("item: a night cut ends the next day (35690)", () => {
  const post = reading(35690).items[0];
  const text =
    "Planowana przerwa: Lisie Jamy (noc 21/22 grudnia)\nw nocy z 21.12.2025r.(niedziela) na 22.12.2025r.(poniedziałek) w godz. od 22:00 do godz. 5:00 nastąpi przerwa w dostawie wody dla mieszkańców miejscowości Lisie Jamy, Wólka Krowicka.";
  const ok = passes(
    checkItem(post, {
      text,
      others: [post.place_verbatim],
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
    checkItem(reading(35661).items[0], {
      text,
      others: ["Lisie Jamy", "Wólka Krowicka"],
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

test("place: the phrase, the locality and the street must be literal", () => {
  assert.match(
    check(item({ place_verbatim: "Lisie Jamy, ul. Polna" })) as string,
    /not in the text/,
  );
  assert.match(
    check(item({ locality: "Lisie Jamy Górne" })) as string,
    /locality "Lisie Jamy Górne" not in/,
  );
  assert.match(
    check(item({ street: "Długa" })) as string,
    /street "Długa" not in/,
  );
});

test("place: a note must be literal", () => {
  assert.match(
    check(item({ note: "w części" })) as string,
    /note "w części" not in the text/,
  );
});

test("Pilipy: 'Młodów, ul. Pilipy' read as all of Młodów is rejected", () => {
  // grok-4.7 at reasoning low, the first prompt, post 39865: three runs alike.
  const text =
    "Przerwa – 21.10.2026: Piastowo, Podlesie, Młodów, ul. Pilipy.\nw dniu: 21.10.2026r. (środa) nastąpi przerwa w dostawie wody dla mieszkańców miejscowości:\nPiastowo, Podlesie, Młodów, ul. Pilipy – od 8:00 do 16:00";
  const whole = item({
    date: "2026-10-21",
    locality: "Młodów",
    street: null,
    place_verbatim: "Młodów",
  });
  const others = ["Piastowo", "Podlesie", "Młodów"];
  const posted = "2026-10-20 11:40:25";
  assert.match(
    check(whole, text, others, posted) as string,
    /"Młodów" leaves out what the text adds/,
  );
  // The phrase has "ul." but the street came back empty.
  assert.match(
    check(
      { ...whole, place_verbatim: "Młodów, ul. Pilipy" },
      text,
      others,
      posted,
    ) as string,
    /names a street, the item none/,
  );
  // Read right, it passes.
  passes(
    check(
      { ...whole, street: "Pilipy", place_verbatim: "Młodów, ul. Pilipy" },
      text,
      ["Piastowo", "Podlesie", "Młodów, ul. Pilipy"],
      posted,
    ),
  );
});

test("omission: house numbers left out of the phrase (39766)", () => {
  const text = textOf(39766);
  assert.match(
    checkOmission("Wólka Krowicka", "Wólka Krowicka", [], text) ?? "",
    /leaves out/,
  );
  assert.equal(
    checkOmission(
      "Wólka Krowicka od nr 144 do nr 159",
      "Wólka Krowicka",
      [],
      text,
    ),
    null,
  );
  // "od 8:00" after a place is the time, not a house range.
  assert.equal(checkOmission("Podlesie", "Podlesie", [], text), null);
});

test("omission: a bracket left out ('(przysiółek Dąbrowa)', 39699)", () => {
  const text = textOf(39699);
  assert.match(
    checkOmission(
      "Basznia Górna od numeru 121 do numeru 144",
      "Basznia Górna",
      [],
      text,
    ) ?? "",
    /leaves out/,
  );
});

test("omission: 'w części' before the place (26028)", () => {
  const text = textOf(26028);
  assert.match(checkOmission("Bałaje", "Bałaje", [], text) ?? "", /leaves out/);
  // Fine when another item's phrase holds the qualified mention.
  assert.equal(
    checkOmission("Bałaje", "Bałaje", ["w części miejscowości Bałaje"], text),
    null,
  );
});

test("omission: a street of the next place is not this place's", () => {
  // 39885: "Bałaje, ul. Przemysłowa (Lubaczów)".
  const text =
    "-28.10.2026 (środa): Załuże–Podłęże od numeru 44 do numeru 92, Bałaje, ul. Przemysłowa (Lubaczów), Antoniki – w godz. od 8:00 do 16:00";
  assert.equal(
    checkOmission("Bałaje", "Bałaje", ["ul. Przemysłowa (Lubaczów)"], text),
    null,
  );
  assert.match(checkOmission("Bałaje", "Bałaje", [], text) ?? "", /leaves out/);
});

test("omission: a village never named on its own (39495)", () => {
  // Only "Lisie Jamy: ul. Polna" is in the text: all of Lisie Jamy is not.
  assert.match(
    checkOmission(
      "Lisie Jamy",
      "Lisie Jamy",
      ["Lisie Jamy: ul. Polna"],
      textOf(39495),
    ) ?? "",
    /not named on its own/,
  );
});

test("scope: house ranges, from what follows the street", () => {
  const scope = (over: Partial<AiItem>) => deriveScope(item(over));
  assert.deepEqual(
    scope({
      locality: "Karolówka",
      street: "Sobieskiego",
      place_verbatim:
        "Karolówka, ul. Sobieskiego numery: od 1 do 15 i od 16 do 54",
    }),
    {
      scope: {
        type: "ranges",
        ranges: [
          { from: "1", to: "15" },
          { from: "16", to: "54" },
        ],
      },
      hamlet: null,
    },
  );
  // Another street's range is not this street's.
  assert.deepEqual(
    scope({
      street: "Długa",
      place_verbatim: "Lisie Jamy: ul. Lwowska od nr 26 do nr 42, Długa",
    }),
    { scope: { type: "whole" }, hamlet: null },
  );
  assert.deepEqual(
    scope({ street: null, locality: "Opaka", place_verbatim: "Opaka nr 104" }),
    { scope: { type: "numbers", numbers: ["104"] }, hamlet: null },
  );
});

test("scope: hamlet, the locality in brackets, a note", () => {
  assert.deepEqual(
    deriveScope(
      item({
        locality: "Basznia Górna",
        street: null,
        place_verbatim:
          "Basznia Górna od numeru 121 do numeru 144 (przysiółek Dąbrowa)",
      }),
    ),
    {
      scope: { type: "ranges", ranges: [{ from: "121", to: "144" }] },
      hamlet: "dąbrowa",
    },
  );
  assert.deepEqual(
    deriveScope(
      item({
        locality: "Lubaczów",
        street: "Przemysłowa",
        place_verbatim: "ul. Przemysłowa (Lubaczów)",
      }),
    ),
    { scope: { type: "whole" }, hamlet: null },
  );
  assert.deepEqual(
    deriveScope(
      item({
        locality: "Lubaczów",
        street: "Przemysłowa",
        place_verbatim:
          "Lubaczów – ul. Przemysłowa (gospodarstwa zasilane z SUW Mokrzyca)",
        note: "gospodarstwa zasilane z SUW Mokrzyca",
      }),
    ),
    { scope: { type: "unknown" }, hamlet: null },
  );
  assert.deepEqual(
    deriveScope(
      item({
        locality: "Bałaje",
        street: null,
        place_verbatim: "w części miejscowości Bałaje",
        note: "w części miejscowości",
      }),
    ),
    { scope: { type: "unknown" }, hamlet: null },
  );
});

test("scope: words we do not read, or a backward range, are rejected", () => {
  assert.match(
    deriveScope(
      item({
        street: null,
        locality: "Opaka",
        place_verbatim: "Opaka (gospodarstwa przy drodze)",
      }),
    ) as string,
    /cannot read/,
  );
  assert.match(
    deriveScope(
      item({
        street: null,
        locality: "Opaka",
        place_verbatim: "Opaka od nr 110 do nr 104",
      }),
    ) as string,
    /runs backwards/,
  );
});
