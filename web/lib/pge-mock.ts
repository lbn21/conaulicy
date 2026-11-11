// Development and preview only: PGE_API_URL=mock:… answers from the
// fixtures instead of PGE, through the same fetch and parse path (usage:
// docs/data/pge.md): the cron's fetch (mockFetch), and the pages' two
// files in the store (mockFiles). lib/pge-feed.ts and lib/live-store.ts
// load it only outside production, and it refuses to answer in production.
import { isoWithOffset, shiftWall, todayInWarsaw } from "./dates.ts";
import { mockFailure, mockLiveFiles } from "./live-mock.ts";
import { PGE_KEY } from "./live-status.ts";
import { fetchOutages, ours, outagesFile } from "./pge-feed.ts";
import { derivedOurs, FAILURE_ID, REAL_2026_11_11 } from "./pge-fixture.ts";
import { ZUK_PLACES } from "./zuk-places.generated.ts";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

type Item = Record<string, unknown>;

const WALL_FIELDS = ["startAt", "stopAt", "createdAt", "updatedAt"];

/** An item's wall times (its ranges' too) moved by `by` ms of wall clock. */
function moved(item: Item, by: number): Item {
  const out: Item = { ...item };
  for (const field of WALL_FIELDS) out[field] = shiftWall(item[field], by);
  if (Array.isArray(item.dateRanges))
    out.dateRanges = (item.dateRanges as Item[]).map((r) => ({
      startAt: shiftWall(r.startAt, by),
      stopAt: shiftWall(r.stopAt, by),
    }));
  return out;
}

/** Wall-clock ms of a "Y-m-d H:i:s" read as UTC: for whole-unit moves. */
const wallMs = (wall: unknown) =>
  Date.parse(`${String(wall).replace(" ", "T")}Z`);

/** The current Warsaw wall clock, as wallMs gives it. */
function nowWall(now: number): number {
  return Date.parse(`${isoWithOffset(now).slice(0, 19)}Z`);
}

/**
 * DERIVED (lib/pge-fixture.ts derivedOurs), moved to now: the planned
 * items by whole days so the first one is tomorrow (Warsaw), their clock
 * times kept; the failure by whole hours so it began in the hour before
 * this one (still on for about an hour).
 */
function oursNow(now: number): Item[] {
  const items = derivedOurs();
  const planned = items.filter((item) => item.uuid !== FAILURE_ID);
  const first = Math.min(...planned.map((item) => wallMs(item.startAt)));
  const tomorrow =
    Date.parse(`${todayInWarsaw(new Date(now))}T00:00:00Z`) + DAY;
  const days = Math.round((tomorrow - (first - (first % DAY))) / DAY) * DAY;
  return items.map((item) => {
    if (item.uuid !== FAILURE_ID) return moved(item, days);
    const start = wallMs(item.startAt);
    const hourAgo = nowWall(now) - (nowWall(now) % HOUR) - HOUR;
    return moved(item, hourAgo - (start - (start % HOUR)));
  });
}

const BODIES: Record<string, (now: number) => string> = {
  none: () => "[]",
  real: () => REAL_2026_11_11,
  ours: (now) => JSON.stringify(oursNow(now)),
};

/** fetch for PGE_API_URL=mock:<none|real|ours>[?fail=…&checkedAgo=…]: 401 without X-Auth-Token, as PGE. */
export const mockFetch: typeof fetch = async (input, init) => {
  if (process.env.VERCEL_ENV === "production")
    throw new Error("PGE mock: off in production");
  const url = new URL(String(input));
  const fail = url.searchParams.get("fail");
  if (fail) return mockFailure(fail, init?.signal);
  if (!new Headers(init?.headers).get("X-Auth-Token"))
    return new Response("", { status: 401 });
  const body = BODIES[url.pathname];
  if (!body) return new Response("", { status: 404 });
  return new Response(body(Date.now()), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};

/**
 * The store's two files for the pages (lib/live-store.ts), as a good cron
 * run `checkedAgo` minutes before `now` (default 0) would have left them:
 * the mock's list, our area's outages, and that run's check. A mock that
 * fails (fail=…) is a store that cannot be read: it throws.
 */
export function mockFiles(
  url: string,
  now: number,
): Promise<{ feed: string; checks: string }> {
  const log = () => {};
  return mockLiveFiles(url, now, PGE_KEY, async (checkedAt) => {
    const feed = await fetchOutages(url, {
      fetch: mockFetch,
      token: "mock",
      log,
      now: () => checkedAt,
    });
    return outagesFile({
      fetchedAt: feed.fetchedAt,
      items: ours(feed.items, ZUK_PLACES, log),
    });
  });
}
