// Development and preview only: IMGW_WARNINGS_URL=mock:… answers from the
// fixtures instead of IMGW, through the same fetch and parse path (usage:
// docs/data/imgw.md). lib/imgw-warnings.ts loads it only outside production,
// and it refuses to answer in production.
import { isoWithOffset, warsawToIso } from "./dates.ts";
import {
  DERIVED_1809_ID,
  derived1809,
  NO_WARNINGS_2026_10_18,
  REAL_2026_10_24,
} from "./imgw-fixture.ts";

const HOUR = 3_600_000;

// also=<level>[,<level>]: more warnings for 1809, also derived (not real):
// others of the feed's (10:00-21:00 and 10:00-19:00, from three hours before
// ours), moved with it.
const ALSO_IDS = ["Sk20261024094216930", "Sk20261024094216309"];

// Hours from the current hour to ours' start: an hour ago, in three hours
// (upcoming), or the next 22:00 at least two hours ahead (night: it ends at
// 4:00 the next day).
function startIn(start: string | null, hour: string): number {
  if (start === "upcoming") return 3;
  if (start !== "night") return -1;
  const ahead = (22 - Number(hour.slice(11, 13)) + 24) % 24;
  return ahead < 2 ? ahead + 24 : ahead;
}

type Item = Record<string, unknown>;

// Wall time ("2026-10-25 13:00:00") moved by whole hours, as wall time.
function shiftWall(wall: unknown, by: number): unknown {
  const iso = typeof wall === "string" && warsawToIso(wall);
  if (!iso) return wall;
  const moved = new Date(Date.parse(`${iso.slice(0, 19)}Z`) + by);
  return moved.toISOString().slice(0, 19).replace("T", " ");
}

// The derived 1809 warning, moved so it began an hour ago (or begins in
// three hours with start=upcoming, or at night with start=night), at the
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

// fail=500|html|timeout, from failAfter (ISO) if given: a broken upstream.
function failure(params: URLSearchParams, signal?: AbortSignal | null) {
  switch (params.get("fail") ?? "500") {
    case "html":
      return Promise.resolve(
        new Response("<!DOCTYPE html><title>Błąd</title>", {
          headers: { "Content-Type": "text/html" },
        }),
      );
    case "timeout":
      return new Promise<Response>((_, reject) =>
        signal?.addEventListener("abort", () => reject(signal.reason)),
      );
    default:
      return Promise.resolve(new Response("", { status: 500 }));
  }
}

/** fetch for IMGW_WARNINGS_URL=mock:<none|real|1809>[?level=…&start=…&also=…&fail=…&failAfter=…]. */
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
    return failure(params, init?.signal);
  const body = BODIES[url.pathname];
  if (!body) return new Response("", { status: 404 });
  return new Response(body(params, now), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};
