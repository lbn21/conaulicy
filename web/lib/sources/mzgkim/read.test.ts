import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CUT_99,
  CUT_100,
  MZGKIM_READINGS,
  realMzgkimPost,
  WHOLE_TOWN,
} from "../../mzgkim-fixture.ts";
import { PRG_NUMBERS } from "../../prg-numbers.generated.ts";
import { MZGKIM } from "../../water-sources.ts";
import { type PostReading, readPost, type ZukPost } from "../../zuk.ts";
import type { AiItem, AiResult } from "../../zuk-ai.ts";
import { inferYear } from "../../zuk-guards.ts";
import { ZUK_PLACES } from "../../zuk-places.generated.ts";
import { mzgkim, TOWN_ID } from "./index.ts";
import { systemPrompt } from "./prompt.ts";

// MZGKiM's real posts read as the cron reads them (lib/zuk-cron.ts: the
// source's rules, the TERYT snapshot), from the model's reading
// (lib/mzgkim-fixture.ts MZGKIM_READINGS, written by hand: no real call).
const CHECKED = "2026-10-03T09:50:00.000Z";
const SOBIESKIEGO = "0972447-20431";
const NIEMIROWSKA = "0972447-14183";
const STARZYNY = "0972447-21042";
const MAZURY = "0972453";
const OSIEDLE = "Osiedle domów jednorodzinnych na zapleczu ul. Niemirowskiej";

const read = (post: ZukPost, ai: AiResult) =>
  readPost(post, ai, ZUK_PLACES, CHECKED, {
    source: MZGKIM,
    gate: mzgkim.gate,
  });

const parsed = (reading: PostReading) => {
  assert.equal(reading.status, "parsed", JSON.stringify(reading));
  return reading as Extract<PostReading, { status: "parsed" }>;
};

/** The real post `id` read with its items changed by `edit`. */
const readWith = (id: number, edit: (items: AiItem[]) => AiItem[]) =>
  read(realMzgkimPost(id), {
    ...MZGKIM_READINGS[id],
    items: edit(structuredClone(MZGKIM_READINGS[id].items)),
  });

test("5237: three streets as TERYT names them, declined or shortened", () => {
  const r = parsed(read(realMzgkimPost(CUT_100), MZGKIM_READINGS[CUT_100]));
  assert.deepEqual(
    r.items.map((d) => [d.place.localityId, d.place.streetId, d.label?.street]),
    [
      ["0972447", SOBIESKIEGO, "Jana III Sobieskiego"],
      ["0972447", NIEMIROWSKA, "Niemirowska"],
      ["0972447", STARZYNY, "Starzyny"],
      [MAZURY, null, null],
    ],
  );
  for (const d of r.items) {
    assert.equal(d.date, "2026-10-06");
    assert.equal(d.start, "2026-10-06 08:30:00");
    assert.equal(d.end, "2026-10-06 15:00:00");
    assert.deepEqual(d.scope, { type: "whole" });
    assert.equal(d.cause, "planned");
    assert.match(d.uid, /^mzgkim-5237-2026-10-06-/);
    assert.deepEqual(d.source, {
      name: "Miejski Zakład Gospodarki Komunalnej i Mieszkaniowej w Lubaczowie",
      url: "https://mzgkim.lubaczow.pl/przerwa-w-dostawie-wody-100/",
      checkedAt: CHECKED,
    });
    assert.equal(d.publishedAt, "2026-10-02 12:11:39");
  }
  // "Osiedle Mazury": the town's part Mazury, never its ul. Mazury.
  assert.deepEqual(r.items[3].label, {
    locality: "Mazury",
    parent: "Lubaczów",
    street: null,
  });
});

test("5237: the area off our list is kept as written, never its street", () => {
  const r = parsed(read(realMzgkimPost(CUT_100), MZGKIM_READINGS[CUT_100]));
  assert.deepEqual(r.unmatched, [OSIEDLE, "Osiedle Mazury"]);
  assert.equal(r.dropped.length, 1);
  // The model taking the area for ul. Niemirowska: dropped, never widened
  // to the whole street (the area's words are more than its name).
  const widened = parsed(
    readWith(CUT_100, (items) =>
      items
        .filter((i) => i.street !== "Niemirowska")
        .map((i) =>
          i.street === OSIEDLE ? { ...i, street: "Niemirowska" } : i,
        ),
    ),
  );
  assert.equal(
    widened.items.some((d) => d.place.streetId === NIEMIROWSKA),
    false,
  );
  assert.deepEqual(widened.unmatched, [OSIEDLE, "Osiedle Mazury"]);
});

test("a part of the town: its cut kept and its words linked too, never lost", () => {
  // TERYT's part Mazury (0972453) has no PRG address point, so no page in
  // production: "Osiedle Mazury" is also linked on the town's other pages.
  assert.equal(
    PRG_NUMBERS.split("\n").some((line) => line.startsWith(`${MAZURY};`)),
    false,
  );
  const r = parsed(read(realMzgkimPost(CUT_100), MZGKIM_READINGS[CUT_100]));
  assert.ok(r.items.some((d) => d.place.localityId === MAZURY));
  assert.deepEqual(r.unmatched?.at(-1), "Osiedle Mazury");
  // Its name alone where the post has no "Osiedle" before it.
  const post = realMzgkimPost(CUT_100);
  const bare = {
    ...post,
    content: {
      rendered: post.content.rendered.replace(
        "<li>Osiedle Mazury</li>",
        "<li>Mazury</li>",
      ),
    },
  };
  const named = parsed(read(bare, MZGKIM_READINGS[CUT_100]));
  assert.deepEqual(named.unmatched, [OSIEDLE, "Mazury"]);
  // A street matched is never also linked.
  assert.equal(
    named.unmatched?.some((w) => /Sobieskiego|Starzyny/.test(w)),
    false,
  );
});

test("5108: Sobieskiego in part, its words as the note; Dąbrowa only a direction", () => {
  const r = parsed(read(realMzgkimPost(CUT_99), MZGKIM_READINGS[CUT_99]));
  const [sobieskiego, ...rest] = r.items;
  assert.equal(sobieskiego.place.streetId, SOBIESKIEGO);
  assert.deepEqual(sobieskiego.scope, { type: "unknown" });
  assert.equal(
    sobieskiego.note,
    "od siedziby Straży Pożarnej w kierunku Dąbrowy",
  );
  assert.deepEqual(
    rest.map((d) => [d.place.streetId, d.scope.type]),
    [
      [NIEMIROWSKA, "whole"],
      [STARZYNY, "whole"],
    ],
  );
  assert.equal(sobieskiego.start, "2026-06-02 08:30:00");
  assert.equal(sobieskiego.end, "2026-06-02 13:00:00");
  // Read without its note, the street is left out, never made whole.
  const whole = parsed(
    readWith(CUT_99, (items) =>
      items.map((i) =>
        i.street === "Jana III Sobieskiego" ? { ...i, note: null } : i,
      ),
    ),
  );
  assert.equal(
    whole.items.some((d) => d.place.streetId === SOBIESKIEGO),
    false,
  );
  assert.deepEqual(whole.unmatched, ["Sobieskiego", OSIEDLE]);
});

test("4935: the whole town at night, every street and the town itself", () => {
  const r = parsed(
    read(realMzgkimPost(WHOLE_TOWN), MZGKIM_READINGS[WHOLE_TOWN]),
  );
  const streets = ZUK_PLACES.streets.filter((s) => s.localityId === TOWN_ID);
  assert.equal(r.items.length, streets.length + 1);
  assert.deepEqual(r.items[0].place, { localityId: TOWN_ID, streetId: null });
  assert.deepEqual(r.items[0].scope, { type: "whole" });
  assert.equal(r.items[0].start, "2025-11-14 23:00:00");
  assert.equal(r.items[0].end, "2025-11-15 03:00:00");
  // The town whole only in the post's own words: elsewhere, dropped.
  const post = realMzgkimPost(WHOLE_TOWN);
  const elsewhere = {
    ...post,
    content: {
      rendered: post.content.rendered.replace(
        "na terenie całego miasta",
        "przy ulicy Kościuszki",
      ),
    },
  };
  assert.deepEqual(read(elsewhere, MZGKIM_READINGS[WHOLE_TOWN]), {
    status: "notice",
    reason: "no place: item 1: town without street",
  });
});

test("a day without its year: the post's year, a day before it next year's", () => {
  // The model giving 6 Oct of the wrong year: the text has no year.
  const r = parsed(
    readWith(CUT_100, (items) =>
      items.map((i) => ({ ...i, date: "2025-10-06" })),
    ),
  );
  assert.ok(r.items.every((d) => d.date === "2026-10-06"));
  // inferYear, on its own.
  const t = "w dniu 3 stycznia (sobota)";
  assert.equal(inferYear("2025-01-03", t, "2025-12-30 10:00:00"), "2026-01-03");
  assert.equal(inferYear("2026-01-03", t, "2025-12-30 10:00:00"), "2026-01-03");
  // Posted on 1 Jan about the day before: that day, not next December.
  assert.equal(
    inferYear("2027-12-31", "w dniu 31 grudnia", "2027-01-01 08:00:00"),
    "2026-12-31",
  );
  assert.equal(
    inferYear("2026-10-06", "6.10 (wtorek)", "2026-10-02 12:00:00"),
    "2026-10-06",
  );
  // A year written with the day stays the model's (the gate checks it).
  assert.equal(
    inferYear("2025-10-06", "6.10.2025", "2026-10-02 12:00:00"),
    "2025-10-06",
  );
  assert.equal(
    inferYear("2025-10-06", "6 października 2025 r.", "2026-10-02 12:00:00"),
    "2025-10-06",
  );
  // 29 Feb only in a leap year.
  assert.equal(
    inferYear("2027-02-29", "29 lutego", "2027-02-20 08:00:00"),
    "2028-02-29",
  );
});

test("a day or time not in the post: the whole post a Notice", () => {
  assert.deepEqual(
    readWith(CUT_100, (items) =>
      items.map((i) => ({ ...i, date: "2026-10-07" })),
    ),
    { status: "notice", reason: "item 1: 7.10 not in text" },
  );
  assert.deepEqual(
    readWith(CUT_100, (items) => items.map((i) => ({ ...i, end: "16:00" }))),
    { status: "notice", reason: "item 1: 16:00 not in the text" },
  );
});

test("the area's rules: never a village, an exact village before a street blocks", () => {
  // A place outside the town: dropped.
  const village = parsed(
    readWith(CUT_99, (items) => [
      ...items,
      {
        ...items[1],
        locality: "Dąbrowa",
        locality_verbatim: "Dąbrowy",
        street: null,
        street_verbatim: null,
      },
    ]),
  );
  assert.match(village.dropped.at(-1) ?? "", /outside the source's area/);
  // "Basznia Dolna, ul. Sobieskiego": its Sobieskiego is not the town's.
  const post = realMzgkimPost(CUT_100);
  const basznia = {
    ...post,
    content: {
      rendered: post.content.rendered.replace(
        "<li>Sobieskiego</li>",
        "<li>Basznia Dolna, ul. Sobieskiego</li>",
      ),
    },
  };
  const r = parsed(
    read(basznia, {
      ...MZGKIM_READINGS[CUT_100],
      items: MZGKIM_READINGS[CUT_100].items.map((i) =>
        i.street === "Jana III Sobieskiego"
          ? { ...i, street_verbatim: "ul. Sobieskiego" }
          : i,
      ),
    }),
  );
  assert.equal(
    r.items.some((d) => d.place.streetId === SOBIESKIEGO),
    false,
  );
  assert.match(r.dropped[0], /proximity: deciding mention Basznia Dolna/);
});

test("the gmina's posts keep the gmina's rules: no area, no declined street", () => {
  // MZGKiM's post read as if the gmina's: the town is never named, so its
  // streets fail the gate's locality checks; only Mazury, named, passes.
  const r = parsed(
    readPost(
      realMzgkimPost(CUT_100),
      MZGKIM_READINGS[CUT_100],
      ZUK_PLACES,
      CHECKED,
    ),
  );
  assert.deepEqual(
    r.items.map((d) => d.uid),
    ["zuk-5237-2026-10-06-0972453"],
  );
  assert.deepEqual(r.dropped, [
    "item 1: locality_verbatim not literal",
    "item 2: locality_verbatim not literal",
    "item 3: locality_verbatim not literal",
    "item 4: locality_verbatim not literal",
  ]);
  // Nothing of the area's: no unmatched places.
  assert.equal(r.unmatched, undefined);
});

test("prompt: the town's parts and streets, a shared part name with its town", () => {
  const prompt = systemPrompt(ZUK_PLACES);
  assert.match(
    prompt,
    /^You read posts \("komunikaty"\) from the website of MZGKiM/,
  );
  const context = prompt.slice(prompt.indexOf("Context:"));
  assert.match(context, /\nTown \(miasto\): Lubaczów\n/);
  assert.match(
    context,
    /\nParts of the town: Mazury, Niwki, Ostrowiec, Piaski \(Lubaczów\), Zaprzekop\n/,
  );
  assert.match(context, /Jana III Sobieskiego, /);
  assert.match(context, /Niemirowska, /);
  // The town's streets only: no village street.
  const streets = context.slice(context.indexOf("Streets of Lubaczów"));
  assert.equal(
    streets.split(", ").length,
    ZUK_PLACES.streets.filter((s) => s.localityId === TOWN_ID).length,
  );
  assert.equal(prompt, systemPrompt(ZUK_PLACES));
  assert.ok(prompt.endsWith("\n"));
});
