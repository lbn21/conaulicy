// The ZUK file's entry for post 39885 („Przerwy w dostawie wody:
// 26-29.10.2026”), built as the cron builds it (lib/zuk-cron.ts) from the
// real post and its recorded reading (lib/zuk-fixture.ts): for the unit
// tests and the dev mock (lib/zuk-store.ts, ZUK_MOCK). A fixture, so code
// (scripts/check-tracked-data.mjs).
import type { PlaceView } from "./schedule.ts";
import { mentionedLocalities, readPost } from "./zuk.ts";
import {
  STALE_MS,
  type StoredPost,
  ZUK_READER,
  type ZukFile,
} from "./zuk-data.ts";
import { PLACES, reading, realPosts } from "./zuk-fixture.ts";

export const POST_39885 = 39885;

/** ul. Żuki in Lubaczów, as the pages get it, with `overrides`. */
export const testPlace = (overrides: Partial<PlaceView> = {}): PlaceView => ({
  id: "0972447-26555",
  kind: "ulica",
  name: "ul. Żuki",
  label: "ul. Żuki, Lubaczów",
  area: "Lubaczów",
  group: "0972447",
  gmina: "Lubaczów (miasto)",
  localityId: "0972447",
  streetId: "0972447-26555",
  zoneId: null,
  nr: null,
  askNumber: false,
  unknownNr: null,
  givenNr: null,
  today: "2026-10-25",
  schedulePage: null,
  days: [],
  sources: [],
  verified: true,
  ...overrides,
});

/** A real post as the file stores it, read when the file was checked. */
export function storedPost(
  id: number,
  checkedAt: string,
  over: Partial<StoredPost> = {},
): StoredPost {
  const post = realPosts().find((p) => p.id === id);
  if (!post) throw new Error(`no real post ${id}`);
  const read = readPost(post, reading(id), PLACES, checkedAt);
  const parsed = read.status === "parsed" ? read.items : [];
  return {
    id,
    modified: post.modified,
    reader: ZUK_READER,
    url: post.link,
    title: post.title.rendered,
    publishedAt: post.date.replace("T", " "),
    updatedAt: post.modified.replace("T", " "),
    status: read.status,
    localityIds: mentionedLocalities(post, PLACES),
    itemCount: parsed.length,
    items: parsed,
    sourceId: "gmina-lubaczow",
    ...over,
  };
}

/** A v4 file of `active` posts, checked at `checkedAt`. */
export function zukFile(active: StoredPost[], checkedAt: string): ZukFile {
  return {
    version: 4,
    generatedAt: checkedAt,
    checkedAt,
    active,
    seen: [],
  };
}

/**
 * The dev mock's file (ZUK_MOCK): 39885 checked a minute ago ("39885"),
 * or over an hour ago ("39885-stale"); "none": no file. Else undefined.
 */
export function mockFile(
  name: string,
  now: number,
): ZukFile | null | undefined {
  if (name === "none") return null;
  const ago = { "39885": 60_000, "39885-stale": STALE_MS + 30 * 60_000 }[name];
  if (ago === undefined) return undefined;
  const checkedAt = new Date(now - ago).toISOString();
  return zukFile([storedPost(POST_39885, checkedAt)], checkedAt);
}
