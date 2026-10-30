import assert from "node:assert/strict";
import { test } from "node:test";
import type { Disruption } from "./disruptions.ts";
import { readPost } from "./zuk.ts";
import {
  AI_DEFERRED,
  AI_UNAVAILABLE,
  dayChanged,
  EXPIRED,
  NOT_WATER,
  PAST,
  parseZukFile,
  STALE_MS,
  type StoredPost,
  settle,
  WATER_QUALITY,
  type ZukFile,
  zukView,
} from "./zuk-data.ts";
import { PLACES, reading, realPosts } from "./zuk-fixture.ts";

const CHECKED = "2026-10-25T08:00:00.000Z";
const NOW = new Date("2026-10-25T08:30:00Z");

function stored(id: number, over: Partial<StoredPost> = {}): StoredPost {
  const post = realPosts().find((p) => p.id === id);
  assert.ok(post);
  const read = readPost(post, reading(id), PLACES, CHECKED);
  return {
    id,
    modified: post.modified,
    url: post.link,
    title: post.title.rendered,
    publishedAt: post.date.replace("T", " "),
    updatedAt: post.modified.replace("T", " "),
    reader: 3,
    sourceId: "gmina-lubaczow",
    status: read.status,
    localityIds: [],
    itemCount: read.status === "parsed" ? read.items.length : 0,
    items: read.status === "parsed" ? read.items : [],
    ...over,
  };
}

const file = (posts: StoredPost[], checkedAt = CHECKED): ZukFile => ({
  version: 5,
  generatedAt: checkedAt,
  checkedAt,
  gazetteer: null,
  active: posts,
  seen: [],
  rejected: [],
  retries: [],
});

test("no file: empty, the source unavailable, stale", () => {
  assert.deepEqual(zukView(null, NOW), {
    disruptions: [],
    notices: [],
    unavailable: true,
    stale: true,
    checkedAt: null,
  });
});

test("stale: data last checked more than 60 minutes ago", () => {
  const at = Date.parse(CHECKED);
  const view = (ms: number) => zukView(file([]), new Date(at + ms));
  assert.equal(view(0).stale, false);
  assert.equal(view(STALE_MS).stale, false);
  assert.equal(view(STALE_MS + 1).stale, true);
  assert.equal(view(STALE_MS + 1).unavailable, false);
  assert.equal(view(0).checkedAt, CHECKED);
});

test("parse: only a file we wrote, of version 5", () => {
  assert.deepEqual(parseZukFile(JSON.stringify(file([]))), file([]));
  assert.equal(parseZukFile("not json"), null);
  assert.equal(parseZukFile(JSON.stringify({ ...file([]), version: 6 })), null);
  // Older versions are no file: the cron reads the window afresh.
  for (const version of [1, 2, 3, 4])
    assert.equal(
      parseZukFile(
        JSON.stringify({
          version,
          generatedAt: CHECKED,
          checkedAt: CHECKED,
          posts: [],
        }),
      ),
      null,
    );
  assert.equal(parseZukFile(JSON.stringify({ ...file([]), seen: null })), null);
  const { rejected: _, ...noRejected } = file([]);
  assert.equal(parseZukFile(JSON.stringify(noRejected)), null);
  assert.equal(
    parseZukFile(JSON.stringify({ ...file([]), gazetteer: 1 })),
    null,
  );
  assert.equal(parseZukFile("null"), null);
});

test("cuts: those still to come, checkedAt from the file", () => {
  const later = "2026-10-25T08:15:00.000Z";
  const { disruptions } = zukView(
    file([stored(39885), stored(39872)], later),
    NOW,
  );
  // 39872 (22 Oct) is over; 39885 (26-29 Oct) is not.
  assert.ok(disruptions.length > 0);
  assert.ok(disruptions.every((d) => d.uid.startsWith("zuk-39885-")));
  assert.ok(disruptions.every((d) => d.source.checkedAt === later));
});

test("cuts: a night cut is shown until its end, the next day", () => {
  const night = stored(35690);
  const view = (iso: string) =>
    zukView(file([night]), new Date(iso)).disruptions.length;
  assert.ok(view("2025-12-22T03:00:00Z") > 0);
  assert.equal(view("2025-12-23T03:00:00Z"), 0);
});

test("notices: for 14 days after the post", () => {
  const notice = stored(34394, { status: "notice", reason: "ambiguous" });
  assert.equal(notice.publishedAt, "2025-10-09 16:01:42");
  const view = (iso: string) => zukView(file([notice]), new Date(iso)).notices;
  const [n] = view("2025-10-22T12:00:00Z");
  assert.equal(n.uid, "zuk-34394");
  assert.equal(n.source.url, notice.url);
  assert.equal(view("2025-10-23T12:00:00Z").length, 0);
});

test("notices: a post whose days are all over is never shown", () => {
  const past = stored(39872, {
    status: "notice",
    reason: PAST,
    itemCount: 0,
    items: [],
  });
  assert.deepEqual(zukView(file([past]), NOW).notices, []);
});

test("clash: two posts give one place and day different hours", () => {
  const a = stored(39863);
  const shift = (d: Disruption) => ({
    ...d,
    uid: `${d.uid}-b`,
    end: "2026-10-20 12:00:00",
  });
  const b = { ...a, id: 1, items: a.items.map(shift) };
  const view = zukView(file([a, b]), new Date("2026-10-20T06:00:00Z"));
  assert.equal(view.disruptions.length, 0);
  assert.deepEqual(view.notices.map((n) => n.uid).sort(), [
    "zuk-1",
    "zuk-39863",
  ]);
});

test("change: only the earlier cuts at its own places become a Notice", () => {
  // 39857 (19 Oct: five villages) and a later post changing dates of two
  // of them (Lisie Jamy, Wólka Krowicka).
  const earlier = stored(39857);
  const change = stored(39855, {
    publishedAt: "2026-10-17 10:00:00",
    change: true,
  });
  const theirs = new Set(change.items.map((d) => d.place.localityId));
  assert.deepEqual([...theirs].sort(), ["0606234", "0606441"]);
  const view = zukView(
    file([earlier, change]),
    new Date("2026-10-16T06:00:00Z"),
  );
  const shown = (d: { uid: string; place: { localityId: string } }) =>
    view.disruptions.some((x) => x.uid === d.uid);
  for (const d of earlier.items)
    assert.equal(shown(d), !theirs.has(d.place.localityId), d.uid);
  assert.ok(change.items.every(shown));
  assert.deepEqual(
    view.notices.map((n) => [n.uid, n.localityIds]),
    [["zuk-39857-changed", ["0606234", "0606441"]]],
  );
  // A street it gives: only that street's earlier cuts.
  const street = change.items.find((d) => d.place.streetId !== null);
  assert.ok(street);
  const narrow = zukView(
    file([
      earlier,
      { ...change, itemCount: 1, items: [street], localityIds: [] },
    ]),
    new Date("2026-10-16T06:00:00Z"),
  );
  assert.deepEqual(
    earlier.items
      .filter((d) => !narrow.disruptions.some((x) => x.uid === d.uid))
      .map((d) => d.place.streetId),
    [street.place.streetId],
  );
});

test("change: a post with no cut (a cancellation) falls back to its localities", () => {
  const earlier = stored(39857);
  const cancel = stored(39855, {
    publishedAt: "2026-10-17 10:00:00",
    change: true,
    status: "notice",
    reason: "no items",
    itemCount: 0,
    items: [],
    localityIds: ["0606180"],
  });
  const view = zukView(
    file([earlier, cancel]),
    new Date("2026-10-16T06:00:00Z"),
  );
  assert.ok(view.disruptions.every((d) => d.place.localityId !== "0606180"));
  assert.ok(view.disruptions.some((d) => d.place.localityId === "0606234"));
  // A change post whose own cuts are over reaches nothing.
  const over = { ...cancel, status: "parsed" as const, itemCount: 2 };
  assert.equal(
    zukView(file([earlier, over]), new Date("2026-10-16T06:00:00Z")).disruptions
      .length,
    earlier.items.length,
  );
});

test("is_past: a past post's cuts settle by their own dates, an ongoing one shown", () => {
  // A failure reported after it started (35661: no start, to 19:00).
  const failure = stored(35661, {
    past: true,
    publishedAt: "2025-12-16 16:01:29",
  });
  const during = zukView(file([failure]), new Date("2025-12-16T17:00:00Z"));
  assert.equal(during.disruptions.length, failure.items.length);
  assert.deepEqual(ids(settle([failure], "2025-12-16").active), [35661]);
  // The same as without the flag: it changes nothing a resident sees.
  const plain = { ...failure, past: undefined };
  assert.deepEqual(
    zukView(file([plain]), new Date("2025-12-16T17:00:00Z")),
    during,
  );
  assert.deepEqual(
    settle([failure], "2025-12-17"),
    settle([plain], "2025-12-17"),
  );
});

const hidden = (id: number, reason: string, over: Partial<StoredPost> = {}) =>
  stored(id, {
    status: "notice",
    reason,
    itemCount: 0,
    items: [],
    localityIds: ["0606441"],
    ...over,
  });

test("not-water, water-quality, waiting or failed: never shown, like past", () => {
  // 39885 published 23 Oct: a Notice of it would still be shown on 25 Oct.
  const shownAsNotice = stored(39885, {
    status: "notice",
    reason: "ambiguous",
    itemCount: 0,
    items: [],
  });
  assert.equal(zukView(file([shownAsNotice]), NOW).notices.length, 1);
  // A waiting or failed reading is never in `active`; not shown even so.
  for (const reason of [
    NOT_WATER,
    WATER_QUALITY,
    PAST,
    AI_DEFERRED,
    AI_UNAVAILABLE,
  ]) {
    const view = zukView(file([hidden(39885, reason)]), NOW);
    assert.deepEqual(view.notices, [], reason);
    assert.deepEqual(view.disruptions, [], reason);
  }
});

test("water-quality: its places are kept in the file, not shown", () => {
  const quality = hidden(39885, WATER_QUALITY, {
    qualityStatus: "warning",
    places: [
      {
        place: { localityId: "0606441", streetId: null },
        label: { locality: "Wólka Krowicka", parent: null, street: null },
        where: "Wólka Krowicka",
        scope: { type: "whole" },
        date: "2026-10-24",
      },
    ],
  });
  const parsed = parseZukFile(JSON.stringify(file([quality])));
  assert.equal(parsed?.active[0].places?.length, 1);
  assert.deepEqual(zukView(parsed, NOW).notices, []);
});

test("not-water: a date-change post that is not about water doubts nothing", () => {
  const earlier = stored(39857);
  const lisie = earlier.items[0].place.localityId;
  const sesja = hidden(39855, NOT_WATER, {
    publishedAt: "2026-10-17 10:00:00",
    change: true,
    localityIds: [lisie],
  });
  const view = zukView(
    file([earlier, sesja]),
    new Date("2026-10-16T06:00:00Z"),
  );
  assert.ok(view.disruptions.length > 0);
  assert.deepEqual(view.notices, []);
});

const TODAY = "2026-10-25";
const ids = (posts: Array<{ id: number }>) => posts.map((p) => p.id);

test("settle: a post whose cuts are all over is seen, past", () => {
  // 39885: cuts 26-29 Oct; 39872: 22 Oct.
  const { active, seen } = settle([stored(39885), stored(39872)], TODAY);
  assert.deepEqual(ids(active), [39885]);
  assert.ok(active[0].items.length > 0);
  assert.deepEqual(seen, [
    { id: 39872, modified: stored(39872).modified, reason: PAST, reader: 3 },
  ]);
  // On 30 Oct 39885's are over too.
  const later = settle(active, "2026-10-30");
  assert.deepEqual(later.active, []);
  assert.deepEqual(
    later.seen.map((p) => [p.id, p.reason]),
    [[39885, PAST]],
  );
});

test("settle: a Notice is active for 14 days, then seen, expired", () => {
  const notice = stored(34394, {
    status: "notice",
    reason: "ambiguous",
    itemCount: 0,
    items: [],
  });
  assert.deepEqual(ids(settle([notice], "2025-10-22").active), [34394]);
  const { active, seen } = settle([notice], "2025-10-23");
  assert.deepEqual(active, []);
  assert.deepEqual(seen, [
    { id: 34394, modified: notice.modified, reason: EXPIRED, reader: 3 },
  ]);
});

test("settle: water-quality stays active, not-water and failed are slim", () => {
  const { active, seen } = settle(
    [
      hidden(39885, WATER_QUALITY, { qualityStatus: "warning", places: [] }),
      hidden(39872, NOT_WATER),
      hidden(39865, AI_UNAVAILABLE),
      hidden(39863, AI_DEFERRED),
    ],
    TODAY,
  );
  assert.deepEqual(ids(active), [39885]);
  // Deferred: in neither. Seen: no title, url, localityIds or items.
  assert.deepEqual(
    seen.map((p) => [p.id, p.reason]),
    [
      [39872, NOT_WATER],
      [39865, AI_UNAVAILABLE],
    ],
  );
  for (const p of seen)
    assert.deepEqual(Object.keys(p).sort(), [
      "id",
      "modified",
      "reader",
      "reason",
    ]);
});

test("settle: a date-change post stays while it doubts an active post", () => {
  // 39857's cuts are on 19 Oct; a date-change Notice on Lisie Jamy after
  // it, whose 14 days are over on 16 Oct.
  const earlier = stored(39857, { publishedAt: "2026-10-01 08:00:00" });
  assert.ok(earlier.items.every((d) => d.date === "2026-10-19"));
  const change = stored(39855, {
    publishedAt: "2026-10-02 10:00:00",
    change: true,
    status: "notice",
    reason: "ambiguous",
    itemCount: 0,
    items: [],
    localityIds: [earlier.items[0].place.localityId],
  });
  const kept = settle([earlier, change], "2026-10-18");
  assert.deepEqual(ids(kept.active), [39857, 39855]);
  // Its earlier post's cuts there a Notice, not dates; the rest shown.
  const view = zukView(file(kept.active), new Date("2026-10-18T06:00:00Z"));
  const there = earlier.items[0].place.localityId;
  assert.ok(view.disruptions.every((d) => d.place.localityId !== there));
  assert.ok(view.disruptions.length > 0);
  assert.deepEqual(
    view.notices.map((n) => n.uid),
    ["zuk-39857-changed"],
  );
  // 39857's cuts over: neither matters.
  const over = settle([earlier, change], "2026-10-20");
  assert.deepEqual(ids(over.active), []);
  assert.deepEqual(
    over.seen.map((p) => [p.id, p.reason]),
    [
      [39857, PAST],
      [39855, EXPIRED],
    ],
  );
  // Not about water: never kept for that.
  const sesja = { ...change, reason: NOT_WATER };
  assert.deepEqual(ids(settle([earlier, sesja], "2026-10-18").active), [39857]);
});

test("dayChanged: a Warsaw midnight in (from, to]", () => {
  const cases: Array<[string, ZukFile | null, string, string, boolean]> = [
    ["no previous file", null, "2026-10-28T22:50Z", "2026-10-28T23:10Z", false],
    ["same day", file([]), "2026-10-29T08:00Z", "2026-10-29T08:15Z", false],
    [
      "midnight inside",
      file([]),
      "2026-10-28T22:50Z",
      "2026-10-28T23:05Z",
      true,
    ],
    // 0:00 Warsaw (CET) on 29 Oct is 2026-10-28T23:00Z.
    [
      "midnight exactly at from",
      file([]),
      "2026-10-28T23:00Z",
      "2026-10-28T23:15Z",
      false,
    ],
    [
      "midnight exactly at to",
      file([]),
      "2026-10-28T22:45Z",
      "2026-10-28T23:00Z",
      true,
    ],
    // DST: 24 Oct is CEST (+2), 25 Oct and 27 Mar CET (+1).
    [
      "CEST midnight, 24 Oct",
      file([]),
      "2026-10-24T21:50Z",
      "2026-10-24T22:10Z",
      true,
    ],
    [
      "CET midnight, 25 Oct",
      file([]),
      "2026-10-25T22:50Z",
      "2026-10-25T23:10Z",
      true,
    ],
    [
      "CET midnight, 27 Mar",
      file([]),
      "2027-03-27T22:50Z",
      "2027-03-27T23:10Z",
      true,
    ],
  ];
  for (const [name, previous, from, to, changed] of cases)
    assert.equal(
      dayChanged(previous, new Date(from), new Date(to)),
      changed,
      name,
    );
});
