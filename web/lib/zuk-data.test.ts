import assert from "node:assert/strict";
import { test } from "node:test";
import type { Disruption } from "./disruptions.ts";
import { readPost } from "./zuk.ts";
import {
  parseZukFile,
  STALE_MS,
  type StoredPost,
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
    status: read.status,
    localityIds: [],
    items: read.status === "parsed" ? read.items : [],
    ...over,
  };
}

const file = (posts: StoredPost[], checkedAt = CHECKED): ZukFile => ({
  version: 1,
  generatedAt: checkedAt,
  checkedAt,
  posts,
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

test("parse: only a file we wrote", () => {
  assert.deepEqual(parseZukFile(JSON.stringify(file([]))), file([]));
  assert.equal(parseZukFile("not json"), null);
  assert.equal(parseZukFile(JSON.stringify({ ...file([]), version: 2 })), null);
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

test("change: an earlier post on the same locality becomes a Notice", () => {
  const earlier = stored(23860, { publishedAt: "2023-10-20 10:00:00" });
  const change = stored(24161, { change: true });
  const view = zukView(
    file([earlier, change]),
    new Date("2023-11-02T06:00:00Z"),
  );
  assert.ok(view.disruptions.every((d) => d.uid.startsWith("zuk-24161-")));
  assert.deepEqual(
    view.notices.map((n) => n.uid),
    ["zuk-23860"],
  );
});
