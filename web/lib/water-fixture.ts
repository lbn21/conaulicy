// The ZUK file's entry for post 39885 („Przerwy w dostawie wody:
// 26-29.10.2026”), built as the cron builds it (lib/zuk-cron.ts) from the
// real post and its recorded reading (lib/zuk-fixture.ts): for the unit
// tests and the dev mock (lib/zuk-store.ts, ZUK_MOCK); MZGKiM's posts the
// same way from lib/mzgkim-fixture.ts (MZGKIM_MOCK). A fixture, so code
// (scripts/check-tracked-data.mjs).
import { addDays, isoWithOffset, todayInWarsaw } from "./dates.ts";
import type { Disruption } from "./disruptions.ts";
import {
  CUT_100,
  MZGKIM_PLACES,
  MZGKIM_READINGS,
  realMzgkimPost,
} from "./mzgkim-fixture.ts";
import type { PlaceView } from "./schedule.ts";
import { MZGKIM, type WaterSourceId } from "./water-sources.ts";
import { type PostReading, readPost, type ZukPost } from "./zuk.ts";
import type { AiResult } from "./zuk-ai.ts";
import {
  STALE_MS,
  type StoredPost,
  ZUK_READER,
  type ZukData,
  type ZukFile,
  zukView,
} from "./zuk-data.ts";
import { PLACES, reading, realPosts } from "./zuk-fixture.ts";

export const POST_39885 = 39885;

/**
 * A made-up cut by house numbers in Krowica Sama, a village with streets:
 * the village only, its numbering running on across its streets (zuk.ts).
 */
export const KROWICA_RANGE: Pick<
  Disruption,
  "place" | "label" | "where" | "scope" | "note"
> = {
  place: { localityId: "0606180", streetId: null },
  label: { locality: "Krowica Sama", parent: null, street: null },
  where: "Krowica Sama od nr 10 do nr 50",
  scope: { type: "ranges", ranges: [{ from: "10", to: "50" }] },
  note: "od nr 10 do nr 50",
};

/**
 * Real post 39872 (22.10.2026), ul. Jana III Sobieskiego in Karolówka "od nr
 * 23 do nr 47", as a cut by house numbers on a street.
 */
export const SOBIESKIEGO_RANGE: Pick<
  Disruption,
  "place" | "label" | "where" | "scope" | "note"
> = {
  place: { localityId: "0606116", streetId: "0606116-20431" },
  label: {
    locality: "Karolówka",
    parent: null,
    street: "Jana III Sobieskiego",
  },
  where: "ul. Jana III Sobieskiego od nr 23 do nr 47",
  scope: { type: "ranges", ranges: [{ from: "23", to: "47" }] },
  note: "od nr 23 do nr 47",
};

/** ul. Jana III Sobieskiego in Karolówka, with the house number as given. */
export const sobieskiego = (givenNr: string | null): PlaceView =>
  testPlace({
    id: "0606116-20431",
    name: "ul. Jana III Sobieskiego",
    label: "ul. Jana III Sobieskiego, Karolówka",
    area: "Karolówka",
    group: "0606116",
    gmina: "Lubaczów (gmina)",
    localityId: "0606116",
    streetId: "0606116-20431",
    givenNr,
  });

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

/** `post` and its reading as the file stores them (lib/zuk-cron.ts). */
function stored(
  post: ZukPost,
  read: PostReading,
  own: Pick<StoredPost, "localityIds" | "sourceId">,
): StoredPost {
  const parsed = read.status === "parsed" ? read.items : [];
  return {
    id: post.id,
    modified: post.modified,
    reader: ZUK_READER,
    url: post.link,
    title: post.title.rendered,
    publishedAt: post.date.replace("T", " "),
    updatedAt: post.modified.replace("T", " "),
    status: read.status,
    itemCount: parsed.length,
    items: parsed,
    ...own,
    ...(read.status === "parsed" && read.rejected.length > 0
      ? {
          unmatched: read.rejected.map((r) => ({
            words: r.words,
            localityId: r.localityId,
          })),
        }
      : {}),
    ...(read.status === "parsed" && read.doubts ? { doubts: read.doubts } : {}),
    ...(post.digest ? { digest: post.digest } : {}),
  };
}

/** A real post as the file stores it, read when the file was checked. */
export function storedPost(
  id: number,
  checkedAt: string,
  over: Partial<StoredPost> = {},
): StoredPost {
  const post = realPosts().find((p) => p.id === id);
  if (!post) throw new Error(`no real post ${id}`);
  const read = readPost(post, reading(id), PLACES, checkedAt);
  return {
    ...stored(post, read, {
      localityIds: read.localityIds,
      sourceId: "gmina-lubaczow",
    }),
    ...over,
  };
}

/**
 * Every source's data at `now`, each file read at `checkedAt`: the gmina's
 * `posts`, MZGKiM's `town` (none: a fresh file with no post).
 */
export function bothViews(
  posts: StoredPost[],
  checkedAt: string,
  now: Date,
  town: StoredPost[] = [],
): Record<WaterSourceId, ZukData> {
  return {
    "gmina-lubaczow": zukView(zukFile(posts, checkedAt), now),
    mzgkim: zukView(zukFile(town, checkedAt), now, MZGKIM),
  };
}

/** A file of `active` posts, checked at `checkedAt`. */
export function zukFile(active: StoredPost[], checkedAt: string): ZukFile {
  return {
    version: 5,
    generatedAt: checkedAt,
    checkedAt,
    gazetteer: null,
    active,
    seen: [],
    rejected: [],
    retries: [],
  };
}

/**
 * An MZGKiM post as the cron stores it (lib/zuk-cron.ts, the source's
 * rules, every place of the TERYT snapshot), from `post` and the model's `ai` reading of it: by default the
 * real post `id` and its reading (lib/mzgkim-fixture.ts).
 */
export function mzgkimPost(
  id: number,
  checkedAt: string,
  over: Partial<StoredPost> = {},
  post: ZukPost = realMzgkimPost(id),
  ai: AiResult = MZGKIM_READINGS[id],
): StoredPost {
  const read = readPost(post, ai, MZGKIM_PLACES, checkedAt, {
    source: MZGKIM,
  });
  return {
    ...stored(post, read, {
      localityIds: [...(MZGKIM.area ?? [])].sort(),
      sourceId: "mzgkim",
    }),
    id,
    ...over,
  };
}

const MONTHS = [
  "stycznia",
  "lutego",
  "marca",
  "kwietnia",
  "maja",
  "czerwca",
  "lipca",
  "sierpnia",
  "września",
  "października",
  "listopada",
  "grudnia",
];
const WEEKDAYS = ["NIEDZIELA", "PONIEDZIAŁEK", "WTOREK", "ŚRODA"];
const WEEKDAYS_REST = ["CZWARTEK", "PIĄTEK", "SOBOTA"];

/**
 * MZGKiM's real post 5237 moved to `now`: posted the day before, its cut
 * (three streets, an area off our list, Mazury) the day after tomorrow,
 * 8:30-15:00, its day and weekday rewritten in its text, and ul. Starzyny
 * swapped for ul. Asnyka, a street of the CI fixture (npm run db:local).
 * For the dev mock.
 */
function movedCut100(now: number, checkedAt: string): StoredPost {
  const today = todayInWarsaw(new Date(now));
  const day = addDays(today, 2);
  const noon = new Date(`${day}T12:00:00Z`);
  const weekday = [...WEEKDAYS, ...WEEKDAYS_REST][noon.getUTCDay()];
  const words = `${noon.getUTCDate()} ${MONTHS[noon.getUTCMonth()]}`;
  const written = `${words} (${weekday})`;
  const real = realMzgkimPost(CUT_100);
  const posted = isoWithOffset(now - 86_400_000).slice(0, 19);
  const post: ZukPost = {
    ...real,
    date: posted,
    modified: posted,
    content: {
      rendered: real.content.rendered
        .replace("6 października (WTOREK)", written)
        .replace("<li>Starzyny</li>", "<li>Asnyka</li>"),
    },
  };
  const ai = MZGKIM_READINGS[CUT_100];
  return mzgkimPost(CUT_100, checkedAt, {}, post, {
    ...ai,
    items: ai.items.map((item) => ({
      ...item,
      date: day,
      date_verbatim: words,
      ...(item.street === "Starzyny"
        ? { street: "Adama Asnyka", street_verbatim: "Asnyka" }
        : {}),
    })),
  });
}

/**
 * The dev mock's file: for ZUK_MOCK, 39885 checked a minute ago ("39885")
 * or over an hour ago ("39885-stale"); for MZGKIM_MOCK, MZGKiM's 5237
 * moved to now (movedCut100), the same ("5237", "5237-stale"); "none": no
 * file. Else undefined.
 */
export function mockFile(
  name: string,
  now: number,
): ZukFile | null | undefined {
  if (name === "none") return null;
  const [id, stale] = name.split("-");
  const ago = { "": 60_000, stale: STALE_MS + 30 * 60_000 }[stale ?? ""];
  if (ago === undefined || (id !== "39885" && id !== "5237")) return undefined;
  const checkedAt = new Date(now - ago).toISOString();
  const post =
    id === "5237"
      ? movedCut100(now, checkedAt)
      : storedPost(POST_39885, checkedAt);
  return zukFile([post], checkedAt);
}
