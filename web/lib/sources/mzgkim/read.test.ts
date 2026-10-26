import assert from "node:assert/strict";
import { test } from "node:test";
import { DISTRICTS } from "../../districts-seed.ts";
import {
  CICHA,
  CUT_99,
  CUT_100,
  MZGKIM_PLACES,
  MZGKIM_READINGS,
  realMzgkimPost,
  WHOLE_TOWN,
  WITH_ESTATE,
} from "../../mzgkim-fixture.ts";
import { MZGKIM } from "../../water-sources.ts";
import { type PostReading, readPost, type ZukPost } from "../../zuk.ts";
import type { AiItem, AiResult } from "../../zuk-ai.ts";
import { ZUK_PLACES } from "../../zuk-places.generated.ts";

// MZGKiM's real posts read as the cron reads them (lib/zuk-cron.ts: the
// source's area, the TERYT snapshot and the districts), from the reading
// the prompt asks for (lib/mzgkim-fixture.ts MZGKIM_READINGS, written by
// hand: no real call).
const CHECKED = "2026-10-03T09:50:00.000Z";
const TOWN = "0972447";
const id = (ulic: string) => `${TOWN}-${ulic}`;
const SOBIESKIEGO = id("20431");
const NIEMIROWSKA = id("14183");
const STARZYNY = id("21042");
const UL_MAZURY = id("12559");
const ESTATE = (DISTRICTS.find((d) => d.id === "mazury")?.streets ?? []).map(
  (s) => s.id,
);
const OSIEDLE = "Osiedle domów jednorodzinnych na zapleczu ul. Niemirowskiej";

const read = (post: ZukPost, ai: AiResult) =>
  readPost(post, ai, MZGKIM_PLACES, CHECKED, { source: MZGKIM });

const parsed = (reading: PostReading) => {
  assert.equal(reading.status, "parsed", JSON.stringify(reading));
  return reading as Extract<PostReading, { status: "parsed" }>;
};

/** The real post `id` read with its items changed by `edit`. */
const readWith = (post: number, edit: (items: AiItem[]) => AiItem[]) =>
  read(realMzgkimPost(post), {
    ...MZGKIM_READINGS[post],
    items: edit(structuredClone(MZGKIM_READINGS[post].items)),
  });

const streetsOf = (r: {
  items: Array<{ place: { streetId: string | null } }>;
}) => r.items.map((d) => d.place.streetId);

test("5237: three listed streets, the town never named", () => {
  const r = parsed(read(realMzgkimPost(CUT_100), MZGKIM_READINGS[CUT_100]));
  assert.deepEqual(
    r.items
      .slice(0, 3)
      .map((d) => [d.place.localityId, d.place.streetId, d.where]),
    [
      [TOWN, SOBIESKIEGO, "Sobieskiego"],
      [TOWN, NIEMIROWSKA, "Niemirowskiej"],
      [TOWN, STARZYNY, "Starzyny"],
    ],
  );
  for (const d of r.items) {
    assert.equal(d.start, "2026-10-06 08:30:00");
    assert.equal(d.end, "2026-10-06 15:00:00");
    assert.match(d.uid, /^mzgkim-5237-2026-10-06-/);
    assert.equal(
      d.source.url,
      "https://mzgkim.lubaczow.pl/przerwa-w-dostawie-wody-100/",
    );
  }
});

test("5237: Osiedle Mazury is its 22 streets, whole, in the post's words", () => {
  const r = parsed(read(realMzgkimPost(CUT_100), MZGKIM_READINGS[CUT_100]));
  const estate = r.items.slice(3);
  assert.deepEqual(
    estate.map((d) => d.place.streetId).sort(),
    [...ESTATE].sort(),
  );
  for (const d of estate) {
    assert.deepEqual(d.scope, { type: "whole" });
    assert.equal(d.where, "Osiedle Mazury");
  }
  assert.equal(streetsOf(r).includes(UL_MAZURY), false);
});

test("5237: a district with no streets known is rejected, linked on the town", () => {
  const r = parsed(read(realMzgkimPost(CUT_100), MZGKIM_READINGS[CUT_100]));
  assert.deepEqual(
    r.rejected.map((x) => [x.reason, x.localityId, x.words]),
    [["district has no streets", TOWN, OSIEDLE]],
  );
});

test("5108: Sobieskiego in part, its words as the note", () => {
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
});

test("4935: the whole town at night, in its words: every street and the town", () => {
  const r = parsed(
    read(realMzgkimPost(WHOLE_TOWN), MZGKIM_READINGS[WHOLE_TOWN]),
  );
  const streets = ZUK_PLACES.streets.filter((s) => s.localityId === TOWN);
  assert.equal(r.items.length, streets.length + 1);
  assert.deepEqual(r.items[0].place, { localityId: TOWN, streetId: null });
  assert.equal(r.items[0].start, "2025-11-14 23:00:00");
  assert.equal(r.items[0].end, "2025-11-15 03:00:00");
  // Its words not in the post: rejected.
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
  const none = read(elsewhere, MZGKIM_READINGS[WHOLE_TOWN]);
  assert.equal(none.status, "notice");
  assert.deepEqual(
    none.rejected.map((x) => x.reason),
    ["not in post"],
  );
});

test("a day or time not in the post: the whole post a Notice", () => {
  const day = readWith(CUT_100, (items) =>
    items.map((i) => ({ ...i, date: "2026-10-07" })),
  );
  assert.equal(day.status === "notice" && day.reason, "item 1: date");
  const time = readWith(CUT_100, (items) =>
    items.map((i) => ({ ...i, end: "16:00" })),
  );
  assert.equal(time.status === "notice" && time.reason, "item 1: time");
});

test("the source's area: a village is not listed; the town only unnamed", () => {
  const r = parsed(
    readWith(CUT_100, (items) => [
      ...items,
      { ...items[0], locality: "Opaka", locality_verbatim: null },
    ]),
  );
  assert.deepEqual(r.rejected.at(-1)?.reason, "locality not listed");
  const named = parsed(
    readWith(CUT_100, (items) =>
      items.map((i, n) =>
        n === 0 ? { ...i, locality_verbatim: "Lubaczów" } : i,
      ),
    ),
  );
  assert.deepEqual(named.rejected[0].reason, "not in post");
});

test("4744: Cicha and ul. Młodowska (Młodów) kept, whole", () => {
  const r = parsed(read(realMzgkimPost(CICHA), MZGKIM_READINGS[CICHA]));
  for (const ulic of ["09582", "13563", "06341", "26445", "23527", "02974"])
    assert.ok(streetsOf(r).includes(id(ulic)), ulic);
  const cicha = r.items.find((d) => d.place.streetId === id("02974"));
  assert.deepEqual(cicha?.scope, { type: "whole" });
  const mlodowska = r.items.find((d) => d.place.streetId === id("13080"));
  assert.deepEqual(mlodowska?.scope, { type: "whole" });
  assert.equal(mlodowska?.where, "ul. Młodowska");
  assert.deepEqual(
    r.items.find((d) => d.place.streetId === id("09582"))?.scope,
    { type: "unknown" },
  );
  assert.deepEqual(r.rejected, []);
});

test("4799: 'X wraz z osiedlem' is two items: the street whole and the district", () => {
  const r = parsed(
    read(realMzgkimPost(WITH_ESTATE), MZGKIM_READINGS[WITH_ESTATE]),
  );
  const mazury = r.items.find((d) => d.place.streetId === UL_MAZURY);
  assert.deepEqual(mazury?.scope, { type: "whole" });
  assert.equal(mazury?.where, "Mazury");
  for (const s of ESTATE) {
    const d = r.items.find((x) => x.place.streetId === s);
    assert.equal(d?.where, "Mazury wraz z osiedlem", s);
  }
  assert.deepEqual(
    r.items.find((d) => d.place.streetId === NIEMIROWSKA)?.scope,
    { type: "whole" },
  );
  // The estate behind Niemirowska has no streets known: linked.
  assert.deepEqual(
    r.rejected.map((x) => [x.reason, x.words]),
    [["district has no streets", "Niemirowska wraz z osiedlem"]],
  );
  assert.equal(r.doubts, undefined);
});

test("a street the post names gives way to the district's entry of it", () => {
  // A street of Osiedle Mazury named in part, then the estate: in part.
  const [street] = ESTATE;
  const name = ZUK_PLACES.streets.find((s) => s.id === street)?.name;
  assert.ok(name);
  const r = parsed(
    readWith(CUT_100, (items) => [
      {
        ...items[0],
        street: name,
        street_verbatim: "Starzyny",
        note: "Starzyny",
      },
      ...items.slice(1),
    ]),
  );
  const cuts = r.items.filter((d) => d.place.streetId === street);
  assert.equal(cuts.length, 1);
  assert.deepEqual(cuts[0].scope, { type: "unknown" });
});

test("doubt: a bare street name the model says may mean a listed district", () => {
  const withDoubt = (doubt: string | null) =>
    parsed(
      readWith(WITH_ESTATE, (items) =>
        items.map((i) => (i.street === "Mazury" ? { ...i, doubt } : i)),
      ),
    );
  assert.deepEqual(withDoubt("Osiedle Mazury").doubts, [
    { words: "Mazury", streetIds: ESTATE },
  ]);
  // Not a listed district, or one with no streets: no doubt.
  assert.equal(withDoubt("Osiedle Mazurskie").doubts, undefined);
  assert.equal(withDoubt("Osiedle Folwarki").doubts, undefined);
  assert.equal(withDoubt(null).doubts, undefined);
});
