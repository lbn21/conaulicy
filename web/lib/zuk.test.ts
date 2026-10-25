import assert from "node:assert/strict";
import { test } from "node:test";
import type { Disruption } from "./disruptions.ts";
import {
  isChangePost,
  isZukPost,
  mentionedLocalities,
  plainText,
  readPost,
  type ZukPost,
} from "./zuk.ts";
import { PLACES, READINGS, reading, realPosts } from "./zuk-fixture.ts";

const CHECKED = "2026-10-25T07:00:00Z";
const posts = realPosts();
const post = (id: number) => {
  const found = posts.find((p) => p.id === id);
  assert.ok(found, `no post ${id}`);
  return found;
};

function cuts(p: ZukPost, ai = reading(p.id)): Disruption[] {
  const read = readPost(p, ai, PLACES, CHECKED);
  assert.equal(read.status, "parsed", JSON.stringify(read));
  return read.status === "parsed" ? read.items : [];
}

const at = (items: Disruption[], date: string) =>
  items
    .filter((d) => d.date === date)
    .map((d) => d.place.streetId ?? d.place.localityId);

test("real: every post the model read, checked and resolved", () => {
  const notices: Record<number, string> = {};
  for (const p of posts) {
    const read = readPost(p, reading(p.id), PLACES, CHECKED);
    if (read.status === "notice") notices[p.id] = read.reason;
  }
  assert.deepEqual(notices, {
    // The fox vaccination post: not a water cut.
    39868: "not an outage notice",
    // Dąbrowa the village or Basznia Górna's Dąbrowa: we do not guess.
    34394: 'item 1: "Dąbrowa" is 2 localities',
  });
  assert.equal(Object.keys(READINGS).length, posts.length);
});

test("real 39885: four days, villages expanded, a street of the town", () => {
  const items = cuts(post(39885));
  const lisie = PLACES.streets.filter((s) => s.localityId === "0606234");
  assert.deepEqual(at(items, "2026-10-26"), [
    "0606234",
    ...lisie.map((s) => s.id),
  ]);
  const dabkow = PLACES.streets.filter((s) => s.localityId === "0606004");
  assert.deepEqual(at(items, "2026-10-27"), [
    "0606004",
    ...dabkow.map((s) => s.id),
    "0972447-26555",
    "0606317",
  ]);
  const opaka = items.find((d) => d.uid === "zuk-39885-2026-10-27-0606317");
  assert.deepEqual(opaka?.scope, {
    type: "ranges",
    ranges: [{ from: "104", to: "110" }],
  });
  assert.equal(opaka?.where, "Opaka od numeru 104 do 110");
  const day28 = at(items, "2026-10-28");
  // Załuże–Podłęże (numbers 44-92), Lubaczów's Przemysłowa, Młodów's Pilipy.
  for (const id of ["0606464", "0972447-17742", "0606286-39507", "0605878"])
    assert.ok(day28.includes(id), id);
  // Pilipy is a street: Młodów itself is not cut.
  assert.ok(!day28.includes("0606286"));
  const first = items[0];
  assert.equal(first.start, "2026-10-26 08:00:00");
  assert.equal(first.end, "2026-10-26 16:00:00");
  assert.equal(first.cause, "planned");
  assert.equal(first.publishedAt, "2026-10-23 18:59:43");
  assert.deepEqual(first.source, {
    name: "Zakład Usług Komunalnych w Mokrzycy",
    url: "https://www.gminalubaczow.pl/2026/10/23/przerwy-w-dostawie-wody-26-29-10-2026/",
    checkedAt: CHECKED,
  });
});

test("real 39865: the reading that dropped ul. Pilipy is a Notice", () => {
  // grok-4.7, the first prompt (before the place rule): all of Młodów.
  const ai = reading(39865);
  const pilipy = ai.items.findIndex((i) => i.street === "Pilipy");
  ai.items[pilipy] = {
    ...ai.items[pilipy],
    street: null,
    place_verbatim: "Młodów",
  };
  const read = readPost(post(39865), ai, PLACES, CHECKED);
  assert.equal(read.status, "notice");
  assert.match(
    read.status === "notice" ? read.reason : "",
    /^item 8: "Młodów" leaves out/,
  );
});

test("real 23860: days inside 'od 06.11.2023 do 10.11.2023' pass", () => {
  const days = new Set(cuts(post(23860)).map((d) => d.date));
  assert.deepEqual(
    [...days],
    ["02", "03", "06", "07", "08", "09", "10"].map((d) => `2023-11-${d}`),
  );
});

test("real 35661: an emergency, its end an estimate", () => {
  const [first] = cuts(post(35661));
  assert.equal(first.cause, "emergency");
  assert.equal(first.start, null);
  assert.equal(first.end, "2025-12-16 19:00:00");
  assert.equal(first.endEstimated, true);
});

test("real 26028: 'w części' and the SUW note are only part of the place", () => {
  const items = cuts(post(26028));
  const balaje = items.find((d) => d.uid === "zuk-26028-2024-04-09-0605878");
  assert.deepEqual(balaje?.scope, { type: "unknown" });
  assert.equal(balaje?.note, "w części miejscowości");
  const przemyslowa = items.find(
    (d) => d.uid === "zuk-26028-2024-04-09-0972447-17742",
  );
  assert.deepEqual(przemyslowa?.scope, { type: "unknown" });
  const zaluze = items.find((d) => d.uid === "zuk-26028-2024-04-10-0606464");
  assert.deepEqual(zaluze?.scope, { type: "unknown" });
  // Bałaje on 10 Apr is named on its own: all of it.
  const later = items.find((d) => d.uid === "zuk-26028-2024-04-10-0605878");
  assert.deepEqual(later?.scope, { type: "whole" });
});

test("real 39699: '(przysiółek Dąbrowa)' is Basznia Górna's Dąbrowa", () => {
  const [only, ...rest] = cuts(post(39699));
  assert.equal(rest.length, 0);
  assert.deepEqual(only.place, { localityId: "0605967", streetId: null });
});

test("a date or time the text does not have makes a Notice", () => {
  const ai = reading(39863);
  ai.items[0] = { ...ai.items[0], date: "2026-10-21" };
  assert.deepEqual(readPost(post(39863), ai, PLACES, CHECKED), {
    status: "notice",
    reason: "item 1: 21.10 not in the text",
  });
  const late = reading(39863);
  late.items[0] = { ...late.items[0], end: "17:00" };
  assert.deepEqual(readPost(post(39863), late, PLACES, CHECKED), {
    status: "notice",
    reason: "item 1: 17:00 not in the text",
  });
});

test("one place and day twice in a post makes a Notice", () => {
  const ai = reading(39863);
  ai.items.push(ai.items[0]);
  const read = readPost(post(39863), ai, PLACES, CHECKED);
  assert.equal(read.status, "notice");
});

test("no items, or not an outage notice", () => {
  assert.deepEqual(
    readPost(
      post(39863),
      { is_outage_notice: true, is_past: false, items: [] },
      PLACES,
      CHECKED,
    ),
    { status: "notice", reason: "no items" },
  );
});

test("uid: the same across re-reads", () => {
  const a = cuts(post(39872)).map((d) => d.uid);
  const b = cuts(post(39872)).map((d) => d.uid);
  assert.deepEqual(a, b);
  assert.ok(a.includes("zuk-39872-2026-10-22-0606116-20431"));
});

test("ZUK posts: water cut notices only", () => {
  const zuk = posts.filter(isZukPost).map((p) => p.id);
  assert.equal(zuk.length, posts.length - 1);
  assert.ok(!zuk.includes(39868));
});

test("date-change posts", () => {
  const change = posts
    .filter((p) => isZukPost(p) && isChangePost(p))
    .map((p) => p.id);
  assert.deepEqual(change.sort(), [23860, 24161, 26028]);
});

test("a Notice's localities: every namesake, not a name inside a longer one", () => {
  assert.deepEqual(mentionedLocalities(post(34394), PLACES), [
    "0605967",
    "0606010",
    "0606168",
  ]);
  const balaje = mentionedLocalities(post(39766), PLACES);
  assert.ok(balaje.includes("0605890"));
  // "Basznia" (a part of Basznia Dolna) is inside "Basznia Dolna".
  assert.ok(!balaje.includes("0605909"));
});

test("plain text: a line per paragraph and list item, entities decoded", () => {
  assert.equal(
    plainText(
      "<p>Przerwa &#8211; <strong>22.10.2026r.</strong>&nbsp;(czwartek)</p>\n<ul><li>Lisie Jamy</li><li>Opaka<br />nr 5</li></ul>",
    ),
    "Przerwa – 22.10.2026r. (czwartek)\nLisie Jamy\nOpaka\nnr 5",
  );
});
