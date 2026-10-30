import assert from "node:assert/strict";
import { test } from "node:test";
import { IMGW } from "./headers.ts";
import { POWIAT } from "./imgw-banner.ts";
import { type ImgwCronDeps, runImgw } from "./imgw-cron.ts";
import { type Feed, fetchFeed, IMGW_URL, latest } from "./imgw-warnings.ts";

const MINUTE = 60_000;

/** One warning as IMGW's feed has it (Warsaw wall times), for our powiat. */
const raw = (over: Record<string, unknown> = {}) => ({
  id: "Sk1",
  nazwa_zdarzenia: "Silny wiatr",
  stopien: "1",
  prawdopodobienstwo: "80",
  obowiazuje_od: "2026-10-24 20:00:00",
  obowiazuje_do: "2026-10-25 18:00:00",
  opublikowano: "2026-10-24 11:42:00",
  tresc: "Prognozuje się silny wiatr.",
  komentarz: "Brak.",
  biuro: "Biuro Prognoz Meteorologicznych w Krakowie",
  teryt: [POWIAT, "1801"],
  ...over,
});

type World = {
  /** The feed's JSON, or IMGW down, or a body of the wrong shape. */
  body: unknown;
  purges: string[];
  logs: Array<Record<string, unknown>>;
};

function world(over: Partial<World> = {}): World {
  return { body: [raw()], purges: [], logs: [], ...over };
}

const imgwFetch = (w: World) =>
  (async (url: string | URL) => {
    assert.equal(String(url), IMGW_URL);
    if (w.body === "down") return new Response("down", { status: 503 });
    if (w.body === "bad") return Response.json({ unexpected: true });
    return Response.json(w.body);
  }) as typeof fetch;

function deps(w: World, over: Partial<ImgwCronDeps> = {}): ImgwCronDeps {
  return {
    url: IMGW_URL,
    fetch: imgwFetch(w),
    purge: (tag) => w.purges.push(tag),
    log: (line) => w.logs.push(line),
    ...over,
  };
}

test("every good fetch purges IMGW once, the feed changed or not", async () => {
  const w = world();
  for (let run = 0; run < 3; run++) {
    w.purges = [];
    assert.deepEqual(await runImgw(deps(w)), { purged: true });
    assert.deepEqual(w.purges, [IMGW]);
  }
  // None for the powiat (IMGW's message instead of a list): purged too.
  w.purges = [];
  w.body = { message: "Brak ostrzeżeń" };
  assert.deepEqual(await runImgw(deps(w)), { purged: true });
  assert.deepEqual(w.purges, [IMGW]);
  assert.deepEqual(w.logs.at(-1), { imgw: "run", purged: true });
});

test("fetch error or a feed of the wrong shape: no purge, logged, never thrown", async () => {
  for (const body of ["down", "bad"] as const) {
    const w = world({ body });
    assert.deepEqual(await runImgw(deps(w)), { error: "feed unavailable" });
    assert.deepEqual(w.purges, []);
    assert.equal(w.logs[0].imgw, "fetch-error");
  }
  const w = world();
  const thrown = await runImgw(
    deps(w, {
      fetch: (async () => {
        throw new Error("timeout");
      }) as typeof fetch,
    }),
  );
  assert.deepEqual(thrown, { error: "feed unavailable" });
  assert.deepEqual(w.purges, []);
  assert.deepEqual(w.logs, [{ imgw: "fetch-error", error: "timeout" }]);
});

test("after a run's purge the pages' copy is fetched afresh: its time the newest check; after a failed run the last good one's", async () => {
  const w = world();
  // The pages' copies (components/imgw-banner.tsx imgwCopy): one per
  // 10-minute slot, tagged IMGW, dropped by a purge of that tag as Next's
  // data cache does.
  const slots = new Map<number, Feed>();
  const purge = (tag: string) => {
    w.purges.push(tag);
    if (tag === IMGW) slots.clear();
  };
  const read = async (slot: number, load: () => Promise<Feed>) => {
    const kept = slots.get(slot);
    if (kept) return kept;
    const feed = await load();
    slots.set(slot, feed);
    return feed;
  };
  const checkedAt = async (now: number) => {
    const copy = await latest(now, read, () =>
      fetchFeed(IMGW_URL, { fetch: imgwFetch(w), now: () => now }),
    );
    return copy && Date.parse(copy.feed.fetchedAt);
  };
  const t0 = Date.parse("2026-10-24T18:00:00Z");
  assert.equal(await checkedAt(t0), t0);
  // Same slot, nothing purged: the cached copy, its time t0.
  assert.equal(await checkedAt(t0 + 4 * MINUTE), t0);
  // A good run in the same slot, the feed unchanged: the next view fetches.
  assert.deepEqual(await runImgw(deps(w, { purge })), { purged: true });
  const latestCheck = t0 + 5 * MINUTE;
  assert.equal(await checkedAt(latestCheck), latestCheck);
  // IMGW down: the run purges nothing, the pages keep the last good copy.
  w.purges = [];
  w.body = "down";
  assert.deepEqual(await runImgw(deps(w, { purge })), {
    error: "feed unavailable",
  });
  assert.deepEqual(w.purges, []);
  assert.equal(await checkedAt(t0 + 7 * MINUTE), latestCheck);
});
