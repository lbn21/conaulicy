// Development and preview only: IMGW_WARNINGS_URL=mock:… answers from the
// fixtures instead of IMGW, through the same fetch and parse path (usage:
// docs/data/imgw.md): the cron's fetch (mockFetch), and the pages' two
// files in the store (mockFiles). lib/imgw-warnings.ts and lib/live-store.ts
// load it only outside production, and it refuses to answer in production.
import { isoWithOffset, shiftWall } from "./dates.ts";
import {
  DERIVED_1809_ID,
  derived1809,
  NO_WARNINGS_2026_10_18,
  REAL_2026_10_24,
} from "./imgw-fixture.ts";
import { feedFile, fetchFeed, ours } from "./imgw-warnings.ts";
import { mockFailure, mockLiveFiles } from "./live-mock.ts";
import { IMGW_KEY } from "./live-status.ts";

const HOUR = 3_600_000;

// also=<level>[,<level>]: more warnings for 1809, also derived (not real):
// others of the feed's (10:00-21:00 and 10:00-19:00, from three hours before
// ours), moved with it.
const ALSO_IDS = ["Sk20261024094216930", "Sk20261024094216309"];

// Ours' first hour (wall time), at least two hours ahead: upcoming at 10:00
// (until 16:00 the same day, whenever it runs), night at 22:00 (until 4:00
// the next day).
const STARTS: Record<string, number> = { upcoming: 10, night: 22 };

// Hours from the current hour to ours' start: an hour ago, or the next
// STARTS hour at least two hours ahead.
function startIn(start: string | null, hour: string): number {
  const at = STARTS[start ?? ""];
  if (at === undefined) return -1;
  const ahead = (at - Number(hour.slice(11, 13)) + 24) % 24;
  return ahead < 2 ? ahead + 24 : ahead;
}

type Item = Record<string, unknown>;

// The derived 1809 warning, moved so it began an hour ago (or begins at
// 10:00 with start=upcoming, or at night with start=night), at the
// level asked for; with also=, more.
function mock1809(params: URLSearchParams, now: number): Item[] {
  const items = derived1809() as Item[];
  const ours = items.find((item) => item.id === DERIVED_1809_ID) as Item;
  const hour = isoWithOffset(now - (now % HOUR)).slice(0, 19);
  const start =
    Date.parse(`${hour}Z`) + startIn(params.get("start"), hour) * HOUR;
  const by =
    start - Date.parse(`${String(ours.obowiazuje_od).replace(" ", "T")}Z`);
  const level = params.get("level");
  const also = params.get("also")?.split(",") ?? [];
  return items.map((item) => {
    const extra = also[ALSO_IDS.indexOf(String(item.id))];
    return {
      ...item,
      obowiazuje_od: shiftWall(item.obowiazuje_od, by),
      obowiazuje_do: shiftWall(item.obowiazuje_do, by),
      opublikowano: shiftWall(item.opublikowano, by),
      ...(item === ours && level ? { stopien: level } : {}),
      ...(extra
        ? { stopien: extra, teryt: [...(item.teryt as string[]), "1809"] }
        : {}),
    };
  });
}

const BODIES: Record<string, (params: URLSearchParams, now: number) => string> =
  {
    none: () => NO_WARNINGS_2026_10_18,
    real: () => REAL_2026_10_24,
    "1809": (params, now) => JSON.stringify(mock1809(params, now)),
  };

/** fetch for IMGW_WARNINGS_URL=mock:<none|real|1809>[?level=…&start=…&also=…&fail=…&failAfter=…&checkedAgo=…]. */
export const mockFetch: typeof fetch = async (input, init) => {
  if (process.env.VERCEL_ENV === "production")
    throw new Error("IMGW mock: off in production");
  const url = new URL(String(input));
  const { searchParams: params } = url;
  const now = Date.now();
  const failAfter = params.get("failAfter");
  if (
    (params.has("fail") || failAfter) &&
    (!failAfter || now >= Date.parse(failAfter))
  )
    return mockFailure(params.get("fail") ?? "500", init?.signal);
  const body = BODIES[url.pathname];
  if (!body) return new Response("", { status: 404 });
  return new Response(body(params, now), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};

/**
 * The store's two files for the pages (lib/live-store.ts), as a good cron
 * run `checkedAgo` minutes before `now` (default 0) would have left them:
 * the mock's feed, our powiats' items, and that run's check. A mock that
 * fails (fail=…, failAfter=…) is a store that cannot be read: it throws.
 */
export function mockFiles(
  url: string,
  now: number,
): Promise<{ feed: string; checks: string }> {
  return mockLiveFiles(url, now, IMGW_KEY, async (checkedAt) => {
    const feed = await fetchFeed(url, {
      fetch: mockFetch,
      now: () => checkedAt,
    });
    return feedFile({ fetchedAt: feed.fetchedAt, items: ours(feed.items) });
  });
}
