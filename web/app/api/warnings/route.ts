import { unstable_cache } from "next/cache";
import type { NextRequest } from "next/server";
import { cacheControl } from "@/lib/gate";
import { NO_STORE } from "@/lib/headers";
import {
  type Feed,
  fetchFeed,
  forPowiat,
  IMGW_ATTRIBUTION,
  IMGW_URL,
  KEEP_SECONDS,
  latest,
  POWIATS,
  REFRESH_SECONDS,
  upstream,
} from "@/lib/imgw-warnings";

// Each copy of the feed lives in Next's data cache (shared by every
// instance) under its 10-minute slot, so IMGW is asked at most once a slot
// and a failed fetch falls back to the newest slot kept (lib/imgw-warnings.ts).
// The fresh read and the look-back must reach the same entry: unstable_cache
// keys on the callback's source text and the key parts, hence one callback
// text for both.
const read = (slot: number, load: () => Promise<Feed>) =>
  unstable_cache(() => load(), ["imgw-warnings", String(slot)], {
    revalidate: KEEP_SECONDS,
  })();

const FRESH = `public, s-maxage=${REFRESH_SECONDS}, stale-while-revalidate=3600`;
// A stale or missing copy is retried within a minute.
const DEGRADED = "public, s-maxage=60";

const source = { url: IMGW_URL, attribution: IMGW_ATTRIBUTION };

// Warnings for one of our powiats (docs/data/imgw.md). Always JSON: "ok",
// "stale" (the last good copy, IMGW failed) or "unavailable" (503).
export async function GET(request: NextRequest) {
  const teryt = request.nextUrl.searchParams.get("teryt") ?? "";
  if (!POWIATS.has(teryt)) {
    return Response.json(
      { error: `teryt: one of ${[...POWIATS].join(", ")}` },
      { status: 400, headers: NO_STORE },
    );
  }
  const now = Date.now();
  const { url, fetch } = await upstream();
  const found = await latest(now, read, () => fetchFeed(url, { fetch }));
  if (!found) {
    return Response.json(
      {
        state: "unavailable",
        teryt,
        fetchedAt: null,
        stale: false,
        warnings: null,
        source,
      },
      { status: 503, headers: { "Cache-Control": cacheControl(DEGRADED) } },
    );
  }
  const { feed, stale } = found;
  return Response.json(
    {
      state: stale ? "stale" : "ok",
      teryt,
      fetchedAt: feed.fetchedAt,
      stale,
      warnings: forPowiat(feed.items, teryt, now),
      source,
    },
    { headers: { "Cache-Control": cacheControl(stale ? DEGRADED : FRESH) } },
  );
}
