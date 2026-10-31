import assert from "node:assert/strict";
import { test } from "node:test";
import { IMGW } from "./headers.ts";
import { banner, imgwCopyOf, POWIAT } from "./imgw-banner.ts";
import { type ImgwCronDeps, runImgw } from "./imgw-cron.ts";
import { IMGW_URL, parseFeedFile } from "./imgw-warnings.ts";
import { IMGW_KEY, parseChecks } from "./live-status.ts";
import { handleZukCron, type ZukCronDeps } from "./zuk-cron.ts";

const SECRET = "cron-secret";
const T0 = new Date("2026-10-24T18:00:00Z");

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

// Paths as lib/live-store.ts has them (FEED_PATH, CHECKS_PATH).
const FEED = "imgw/feed.json";
const CHECKS = "status/checks.json";

type World = {
  /** The feed's JSON, or IMGW down, or a body of the wrong shape. */
  body: unknown;
  /** The private Blob store, by pathname. */
  store: Map<string, string>;
  writes: string[];
  purges: string[];
  logs: Array<Record<string, unknown>>;
};

function world(over: Partial<World> = {}): World {
  return {
    body: [raw()],
    store: new Map(),
    writes: [],
    purges: [],
    logs: [],
    ...over,
  };
}

const imgwFetch = (w: World) =>
  (async (url: string | URL) => {
    assert.equal(String(url), IMGW_URL);
    if (w.body === "down") return new Response("down", { status: 503 });
    if (w.body === "bad") return Response.json({ unexpected: true });
    return Response.json(w.body);
  }) as typeof fetch;

const file = (w: World, path: string) => ({
  read: async () => w.store.get(path) ?? null,
  write: async (body: string) => {
    w.writes.push(path);
    w.store.set(path, body);
  },
});

function deps(w: World, over: Partial<ImgwCronDeps> = {}): ImgwCronDeps {
  const feed = file(w, FEED);
  return {
    url: IMGW_URL,
    fetch: imgwFetch(w),
    readFeed: feed.read,
    writeFeed: feed.write,
    log: (line) => w.logs.push(line),
    ...over,
  };
}

const items = (w: World) =>
  parseFeedFile(w.store.get(FEED) ?? null)?.items.map((item) => item.id);

test("a good fetch writes the feed file only when our items changed", async () => {
  const w = world({
    body: [raw(), raw({ id: "Far", teryt: ["0201"] })],
  });
  assert.deepEqual(await runImgw(deps(w)), { checked: true, changed: true });
  // Only our powiats' items are kept.
  assert.deepEqual(items(w), ["Sk1"]);
  assert.deepEqual(w.writes, [FEED]);
  // The same items (another powiat's changed): nothing written.
  w.body = [raw(), raw({ id: "Far2", teryt: ["0201"] })];
  assert.deepEqual(await runImgw(deps(w)), { checked: true, changed: false });
  assert.deepEqual(w.writes, [FEED]);
  // Ours changed: written.
  w.body = [raw({ stopien: "2" })];
  assert.deepEqual(await runImgw(deps(w)), { checked: true, changed: true });
  assert.deepEqual(w.writes, [FEED, FEED]);
  // None any more (IMGW's message instead of a list): written, empty.
  w.body = { message: "Brak ostrzeżeń" };
  assert.deepEqual(await runImgw(deps(w)), { checked: true, changed: true });
  assert.deepEqual(items(w), []);
  assert.deepEqual(w.logs.at(-1), { imgw: "run", changed: true, items: 0 });
});

test("a feed file that cannot be read, or is not one: written afresh", async () => {
  const w = world();
  w.store.set(FEED, '{"version":0}');
  assert.deepEqual(await runImgw(deps(w)), { checked: true, changed: true });
  assert.deepEqual(items(w), ["Sk1"]);
  const v = world();
  const thrown = await runImgw(
    deps(v, {
      readFeed: async () => {
        throw new Error("blob down");
      },
    }),
  );
  assert.deepEqual(thrown, { checked: true, changed: true });
  assert.equal(v.logs[0].imgw, "feed-unreadable");
});

test("fetch error or a feed of the wrong shape: nothing written, logged, never thrown", async () => {
  for (const body of ["down", "bad"] as const) {
    const w = world({ body });
    assert.deepEqual(await runImgw(deps(w)), { error: "feed unavailable" });
    assert.deepEqual(w.writes, []);
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
  assert.deepEqual(w.writes, []);
  assert.deepEqual(w.logs, [{ imgw: "fetch-error", error: "timeout" }]);
});

test("the file not written: not a good check", async () => {
  const w = world();
  const result = await runImgw(
    deps(w, {
      writeFeed: async () => {
        throw new Error("blob down");
      },
    }),
  );
  assert.deepEqual(result, { error: "feed not written" });
  assert.equal(w.logs[0].imgw, "write-error");
});

// The cron as the route runs it: a water run that fails at once (its file
// unreadable, so it stops there), IMGW beside it, the status file after.
function cron(w: World, now: Date, cache: Map<string, string[]>) {
  const clock = () => now.getTime();
  const water: ZukCronDeps = {
    fetch: (async () => {
      throw new Error("no network");
    }) as typeof fetch,
    readFile: async () => {
      throw new Error("water file unreadable");
    },
    writeFile: async () => assert.fail("no water write"),
    // As revalidateTag does: drops every cached entry with the tag.
    purge: (tag) => {
      w.purges.push(tag);
      for (const [key, tags] of cache)
        if (tags.includes(tag)) cache.delete(key);
    },
    places: async () => assert.fail("no places"),
    xaiKey: undefined,
    now: () => now,
    log: (line) => w.logs.push(line),
  };
  return handleZukCron(
    new Request("https://conaulicy.pl/api/cron/zuk", {
      headers: { authorization: `Bearer ${SECRET}` },
    }),
    SECRET,
    water,
    [],
    () => runImgw(deps(w, { now: clock })),
    file(w, CHECKS),
  );
}

test("the cron: a good check is recorded, then IMGW purged; a failure records ok:false, the feed kept", async () => {
  const w = world();
  // The pages' cached copy of the store's files (lib/live-store.ts),
  // tagged IMGW as Next's data cache keeps it.
  const cache = new Map<string, string[]>();
  await cron(w, T0, cache);
  assert.deepEqual(w.writes, [FEED, CHECKS]);
  assert.deepEqual(w.purges, [IMGW]);
  const good = parseChecks(w.store.get(CHECKS) ?? null);
  assert.deepEqual(good?.sources[IMGW_KEY], {
    checkedAt: T0.toISOString(),
    attemptAt: T0.toISOString(),
    ok: true,
  });
  const feed = w.store.get(FEED);
  // A page renders: its copy cached, tagged.
  cache.set("imgw-files", [IMGW]);
  // IMGW down 15 minutes on: the feed file untouched, the try recorded,
  // no purge, the cached copy kept.
  w.body = "down";
  w.writes = [];
  w.purges = [];
  const later = new Date(T0.getTime() + 15 * 60_000);
  await cron(w, later, cache);
  assert.deepEqual(w.writes, [CHECKS]);
  assert.deepEqual(w.purges, []);
  assert.equal(w.store.get(FEED), feed);
  assert.ok(cache.has("imgw-files"));
  assert.deepEqual(parseChecks(w.store.get(CHECKS) ?? null)?.sources.imgw, {
    checkedAt: T0.toISOString(),
    attemptAt: later.toISOString(),
    ok: false,
  });
  // The pages' copy: the last good feed and check.
  const copy = imgwCopyOf(
    w.store.get(FEED) ?? null,
    w.store.get(CHECKS) ?? null,
  );
  assert.equal(copy?.checkedAt, T0.getTime());
  assert.deepEqual(
    copy?.feed.items.map((item) => item.id),
    ["Sk1"],
  );
});

test("a purge never touches the feed file: the next render reads the same copy", async () => {
  const w = world();
  const cache = new Map<string, string[]>([["imgw-files", [IMGW]]]);
  await cron(w, T0, cache);
  const before = new Map(w.store);
  // Every good run purges; the store is not a cache.
  for (let run = 1; run <= 3; run++) {
    cache.set("imgw-files", [IMGW]);
    await cron(w, new Date(T0.getTime() + run * 15 * 60_000), cache);
    assert.equal(cache.has("imgw-files"), false);
    assert.equal(w.store.get(FEED), before.get(FEED));
  }
  const now = T0.getTime() + 46 * 60_000;
  const shown = banner(
    imgwCopyOf(w.store.get(FEED) ?? null, w.store.get(CHECKS) ?? null),
    now,
  );
  assert.equal(shown?.warnings.length, 1);
  assert.equal(shown?.notice, null);
});
