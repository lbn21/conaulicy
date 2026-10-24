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

type Item = Record<string, unknown>;

// Wall time ("2026-10-25 13:00:00") moved by whole hours, as wall time.
function shiftWall(wall: unknown, by: number): unknown {
  const iso = typeof wall === "string" && warsawToIso(wall);
  if (!iso) return wall;
  const moved = new Date(Date.parse(`${iso.slice(0, 19)}Z`) + by);
  return moved.toISOString().slice(0, 19).replace("T", " ");
}

// The derived 1809 warning, moved so it began an hour ago (or begins in
// three hours with start=upcoming), at the level asked for.
function mock1809(params: URLSearchParams, now: number): Item[] {
  const items = derived1809() as Item[];
  const ours = items.find((item) => item.id === DERIVED_1809_ID) as Item;
  const hour = isoWithOffset(now - (now % HOUR)).slice(0, 19);
  const start =
    Date.parse(`${hour}Z`) +
    (params.get("start") === "upcoming" ? 3 : -1) * HOUR;
  const by =
    start - Date.parse(`${String(ours.obowiazuje_od).replace(" ", "T")}Z`);
  const level = params.get("level");
  return items.map((item) => ({
    ...item,
    obowiazuje_od: shiftWall(item.obowiazuje_od, by),
    obowiazuje_do: shiftWall(item.obowiazuje_do, by),
    opublikowano: shiftWall(item.opublikowano, by),
    ...(item === ours && level ? { stopien: level } : {}),
  }));
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

/** fetch for IMGW_WARNINGS_URL=mock:<none|real|1809>[?level=…&start=…&fail=…&failAfter=…]. */
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
