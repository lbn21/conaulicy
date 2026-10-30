import assert from "node:assert/strict";
import { test } from "node:test";
import { IMGW } from "./headers.ts";
import { POWIAT } from "./imgw-banner.ts";
import { type ImgwCronDeps, runImgw, shownSignature } from "./imgw-cron.ts";
import { type Feed, IMGW_URL, parseFeed } from "./imgw-warnings.ts";

const quiet = () => {};
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

const feed = (...items: unknown[]): Feed => ({
  fetchedAt: "2026-10-24T12:00:00+02:00",
  items: parseFeed(items, quiet),
});

const at = (iso: string) => Date.parse(iso);

type World = {
  /** The feed's JSON, or IMGW down, or a body of the wrong shape. */
  body: unknown;
  state: string | null;
  purges: string[];
  writes: string[];
  logs: Array<Record<string, unknown>>;
  now: Date;
  /** Each step, in order: "purge imgw", "write". */
  order: string[];
};

function world(over: Partial<World> = {}): World {
  return {
    body: [raw()],
    state: null,
    purges: [],
    writes: [],
    logs: [],
    now: new Date("2026-10-24T18:00:00Z"),
    order: [],
    ...over,
  };
}

function deps(w: World, over: Partial<ImgwCronDeps> = {}): ImgwCronDeps {
  return {
    url: IMGW_URL,
    fetch: (async (url: string | URL) => {
      assert.equal(String(url), IMGW_URL);
      if (w.body === "down") return new Response("down", { status: 503 });
      if (w.body === "bad") return Response.json({ unexpected: true });
      return Response.json(w.body);
    }) as typeof fetch,
    readState: async () => w.state,
    writeState: async (body) => {
      w.order.push("write");
      w.writes.push(body);
      w.state = body;
    },
    purge: (tag) => {
      w.order.push(`purge ${tag}`);
      w.purges.push(tag);
    },
    now: () => w.now,
    log: (line) => w.logs.push(line),
    ...over,
  };
}

/** A run at `time`: whether it purged. */
async function runAt(w: World, time: number) {
  w.now = new Date(time);
  const before = w.purges.length;
  await runImgw(deps(w));
  return w.purges.length - before;
}

test("no state yet: purges IMGW once, then stores the signature", async () => {
  const w = world();
  assert.deepEqual(await runImgw(deps(w)), { changed: true });
  assert.deepEqual(w.purges, [IMGW]);
  assert.deepEqual(w.order, [`purge ${IMGW}`, "write"]);
  assert.equal(w.state, shownSignature(feed(raw()), w.now.getTime()));
});

test("same feed, same time: no purge, nothing written", async () => {
  const w = world();
  await runImgw(deps(w));
  w.purges = [];
  w.writes = [];
  assert.deepEqual(await runImgw(deps(w)), { changed: false });
  assert.deepEqual(w.purges, []);
  assert.deepEqual(w.writes, []);
  // Later, nothing started or ended in between: still none.
  assert.equal(await runAt(w, at("2026-10-24T18:15:00Z")), 0);
});

test("a new, a changed and a removed warning for the powiat each purge once", async () => {
  const w = world();
  await runImgw(deps(w));
  const steps: unknown[][] = [
    // New.
    [raw(), raw({ id: "Sk2", nazwa_zdarzenia: "Opady śniegu" })],
    // Changed: the level, the probability, the end.
    [
      raw({ stopien: "2" }),
      raw({ id: "Sk2", nazwa_zdarzenia: "Opady śniegu" }),
    ],
    [
      raw({ stopien: "2", prawdopodobienstwo: "90" }),
      raw({ id: "Sk2", nazwa_zdarzenia: "Opady śniegu" }),
    ],
    [
      raw({
        stopien: "2",
        prawdopodobienstwo: "90",
        obowiazuje_do: "2026-10-25 20:00:00",
      }),
      raw({ id: "Sk2", nazwa_zdarzenia: "Opady śniegu" }),
    ],
    // Sk1 removed, Sk2's text changed; then its event, its publication.
    [raw({ id: "Sk2", nazwa_zdarzenia: "Opady śniegu", tresc: "Inna treść." })],
    [raw({ id: "Sk2", nazwa_zdarzenia: "Oblodzenie", tresc: "Inna treść." })],
    [
      raw({
        id: "Sk2",
        nazwa_zdarzenia: "Oblodzenie",
        tresc: "Inna treść.",
        opublikowano: "2026-10-24 13:00:00",
      }),
    ],
  ];
  for (const body of steps) {
    w.body = body;
    w.purges = [];
    await runImgw(deps(w));
    assert.deepEqual(w.purges, [IMGW], JSON.stringify(body));
    w.purges = [];
    await runImgw(deps(w));
    assert.deepEqual(w.purges, [], JSON.stringify(body));
  }
  // Removed: none left (IMGW's message instead of a list).
  w.body = { message: "Brak ostrzeżeń" };
  await runImgw(deps(w));
  assert.deepEqual(w.purges, [IMGW]);
  assert.equal(w.state, "[]");
});

test("a change for another powiat only: no purge", async () => {
  const w = world();
  await runImgw(deps(w));
  w.purges = [];
  w.body = [raw(), raw({ id: "Sk9", teryt: ["0221"] })];
  await runImgw(deps(w));
  assert.deepEqual(w.purges, []);
  w.body = [raw(), raw({ id: "Sk9", teryt: ["0221"], stopien: "3" })];
  await runImgw(deps(w));
  assert.deepEqual(w.purges, []);
  // The same warning now covering the powiat: shown, so purged.
  w.body = [raw(), raw({ id: "Sk9", teryt: ["0221", POWIAT], stopien: "3" })];
  await runImgw(deps(w));
  assert.deepEqual(w.purges, [IMGW]);
});

test("a warning's end and start, to the millisecond", () => {
  // From 25 Oct 08:00 (07:00Z) to 18:00 (17:00Z), Warsaw winter time.
  const f = feed(
    raw({
      obowiazuje_od: "2026-10-25 08:00:00",
      obowiazuje_do: "2026-10-25 18:00:00",
    }),
  );
  const from = at("2026-10-25T07:00:00Z");
  const to = at("2026-10-25T17:00:00Z");
  const sig = (t: number) => shownSignature(f, t);
  // Starts: validFrom == now is in force.
  assert.notEqual(sig(from - 1), sig(from));
  assert.equal(sig(from - 2), sig(from - 1));
  assert.equal(sig(from), sig(from + 1));
  assert.match(sig(from - 1), /false\]\]$/);
  assert.match(sig(from), /true\]\]$/);
  // Ends: validTo == now has ended.
  assert.notEqual(sig(to - 1), sig(to));
  assert.equal(sig(to - 1), sig(from));
  assert.equal(sig(to), "[]");
  assert.equal(sig(to + 1), "[]");
});

test("time alone: the run after a warning ends or starts purges, once", async () => {
  const w = world({
    body: [
      raw({
        obowiazuje_od: "2026-10-25 08:00:00",
        obowiazuje_do: "2026-10-25 18:00:00",
      }),
    ],
  });
  const from = at("2026-10-25T07:00:00Z");
  const to = at("2026-10-25T17:00:00Z");
  assert.equal(await runAt(w, from - 15 * MINUTE), 1);
  assert.equal(await runAt(w, from - 1), 0);
  assert.equal(await runAt(w, from), 1);
  assert.equal(await runAt(w, from + 15 * MINUTE), 0);
  assert.equal(await runAt(w, to - 1), 0);
  assert.equal(await runAt(w, to), 1);
  assert.equal(await runAt(w, to + 15 * MINUTE), 0);
});

/**
 * Runs every `step` from `start` to `end`: the instants of those that
 * purged, the first one aside (no state yet).
 */
async function purgedAt(
  body: unknown[],
  start: number,
  end: number,
  step = MINUTE,
) {
  const w = world({ body });
  await runAt(w, start);
  const purged: string[] = [];
  for (let t = start + step; t <= end; t += step)
    if (await runAt(w, t)) purged.push(new Date(t).toISOString());
  return purged;
}

test("DST, 25 Oct 2026 (03:00 back to 02:00): the end and the start each at their one instant", async () => {
  // Clocks go back: 02:30 happens twice, first at 00:30Z (+02:00), then
  // at 01:30Z (+01:00). A warning to 02:30 ends at the later one, a
  // warning from 02:30 starts at the earlier one (lib/imgw-warnings.ts).
  const night = [at("2026-10-24T22:00:00Z"), at("2026-10-25T04:00:00Z")];
  assert.deepEqual(
    await purgedAt(
      [
        raw({
          obowiazuje_od: "2026-10-24 20:00:00",
          obowiazuje_do: "2026-10-25 02:30:00",
        }),
      ],
      night[0],
      night[1],
    ),
    ["2026-10-25T01:30:00.000Z"],
  );
  assert.deepEqual(
    await purgedAt(
      [
        raw({
          obowiazuje_od: "2026-10-25 02:30:00",
          obowiazuje_do: "2026-10-25 18:00:00",
        }),
      ],
      night[0],
      night[1],
    ),
    ["2026-10-25T00:30:00.000Z"],
  );
  // Exact on both sides of each instant.
  const ending = feed(raw({ obowiazuje_do: "2026-10-25 02:30:00" }));
  const end = at("2026-10-25T01:30:00Z");
  assert.notEqual(shownSignature(ending, end - 1), "[]");
  assert.equal(shownSignature(ending, end), "[]");
  assert.notEqual(shownSignature(ending, at("2026-10-25T00:30:00Z")), "[]");
  const starting = feed(raw({ obowiazuje_od: "2026-10-25 02:30:00" }));
  const start = at("2026-10-25T00:30:00Z");
  assert.match(shownSignature(starting, start - 1), /false\]\]$/);
  assert.match(shownSignature(starting, start), /true\]\]$/);
});

test("DST, 29 Mar 2026 (02:00 forward to 03:00): the end and the start each at their one instant", async () => {
  // 01:30 is +01:00 (00:30Z), 03:00 is +02:00 (01:00Z): one hour apart.
  const night = [at("2026-03-28T22:00:00Z"), at("2026-03-29T04:00:00Z")];
  assert.deepEqual(
    await purgedAt(
      [
        raw({
          obowiazuje_od: "2026-03-28 20:00:00",
          obowiazuje_do: "2026-03-29 03:00:00",
        }),
      ],
      night[0],
      night[1],
    ),
    ["2026-03-29T01:00:00.000Z"],
  );
  assert.deepEqual(
    await purgedAt(
      [
        raw({
          obowiazuje_od: "2026-03-29 01:30:00",
          obowiazuje_do: "2026-03-29 18:00:00",
        }),
      ],
      night[0],
      night[1],
    ),
    ["2026-03-29T00:30:00.000Z"],
  );
  // Both in one feed: two purges, each at its own instant.
  assert.deepEqual(
    await purgedAt(
      [
        raw({
          obowiazuje_od: "2026-03-28 20:00:00",
          obowiazuje_do: "2026-03-29 03:00:00",
        }),
        raw({
          id: "Sk2",
          obowiazuje_od: "2026-03-29 01:30:00",
          obowiazuje_do: "2026-03-29 18:00:00",
        }),
      ],
      night[0],
      night[1],
    ),
    ["2026-03-29T00:30:00.000Z", "2026-03-29T01:00:00.000Z"],
  );
  const ending = feed(raw({ obowiazuje_do: "2026-03-29 03:00:00" }));
  const end = at("2026-03-29T01:00:00Z");
  assert.notEqual(shownSignature(ending, end - 1), "[]");
  assert.equal(shownSignature(ending, end), "[]");
});

test("fetch error or a feed of the wrong shape: no purge, state kept, logged, never thrown", async () => {
  for (const body of ["down", "bad"] as const) {
    const w = world({ body, state: "earlier" });
    assert.deepEqual(await runImgw(deps(w)), { error: "feed unavailable" });
    assert.deepEqual(w.purges, []);
    assert.deepEqual(w.writes, []);
    assert.equal(w.state, "earlier");
    assert.equal(w.logs[0].imgw, "fetch-error");
  }
  const w = world({ state: "earlier" });
  const thrown = await runImgw(
    deps(w, {
      fetch: (async () => {
        throw new Error("timeout");
      }) as typeof fetch,
    }),
  );
  assert.deepEqual(thrown, { error: "feed unavailable" });
  assert.deepEqual(w.purges, []);
  assert.equal(w.state, "earlier");
  assert.deepEqual(w.logs, [{ imgw: "fetch-error", error: "timeout" }]);
});

test("the state unreadable: no purge, nothing written, logged, never thrown", async () => {
  const w = world();
  const result = await runImgw(
    deps(w, {
      readState: async () => {
        throw new Error("blob: 500");
      },
    }),
  );
  assert.deepEqual(result, { error: "failed" });
  assert.deepEqual(w.purges, []);
  assert.deepEqual(w.writes, []);
  assert.deepEqual(w.logs, [{ imgw: "error", error: "blob: 500" }]);
});

test("the signature: by id, whatever the feed's order", () => {
  const now = at("2026-10-24T18:00:00Z");
  const a = raw({ id: "Sk1", stopien: "1" });
  const b = raw({ id: "Sk2", stopien: "3" });
  assert.equal(
    shownSignature(feed(a, b), now),
    shownSignature(feed(b, a), now),
  );
  assert.deepEqual(
    JSON.parse(shownSignature(feed(b, a), now)).map((w: unknown[]) => w[0]),
    ["Sk1", "Sk2"],
  );
});
