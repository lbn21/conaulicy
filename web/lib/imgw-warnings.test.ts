import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { warsawToIso } from "./dates.ts";
import {
  DERIVED_1809_ID,
  derived1809,
  NO_WARNINGS_2026_10_18,
  REAL_2026_10_24,
  ZONED_2026_10_24,
} from "./imgw-fixture.ts";
import { mockFetch, mockFiles } from "./imgw-mock.ts";
import {
  feedFile,
  fetchFeed,
  forPowiat,
  IMGW_URL,
  ours,
  POWIATS,
  parseFeed,
  parseFeedFile,
  upstream,
} from "./imgw-warnings.ts";
import { IMGW_KEY, parseChecks } from "./live-status.ts";

const quiet = () => {};
const real = () => parseFeed(JSON.parse(REAL_2026_10_24), quiet);
// 24 Oct 2026, 20:00 in Warsaw: before every warning in the fixture.
const EVENING = Date.parse("2026-10-24T18:00:00Z");

const answer = (body: string, status = 200, type = "application/json") =>
  (async () =>
    new Response(body, {
      status,
      headers: { "Content-Type": type },
    })) as typeof fetch;

test("the real feed: 8 warnings, every field read", () => {
  const items = real();
  assert.equal(items.length, 8);
  assert.deepEqual(items[0], {
    id: "Sk20261024094211181",
    event: "Silny wiatr",
    level: 2,
    probability: 75,
    validFrom: "2026-10-25T08:00:00+01:00",
    validTo: "2026-10-25T18:00:00+01:00",
    text: "Prognozuje się wystąpienie silnego wiatru o średniej prędkości do 45 km/h, w porywach do 90 km/h, z południa.",
    office: "Centralne Biuro Prognoz Meteorologicznych w Warszawie",
    published: "2026-10-24T11:42:00+02:00",
    teryt: ["0221", "0207", "0206", "0212", "0261", "0265"],
  });
  assert.deepEqual(forPowiat(items, "1809", EVENING), []);
});

test("times match meteo.imgw.pl's zoned times for the same ids, across the DST change", () => {
  const items = real();
  assert.equal(items.length, Object.keys(ZONED_2026_10_24).length);
  for (const item of items) {
    assert.deepEqual(
      [item.validFrom, item.validTo, item.published],
      ZONED_2026_10_24[item.id],
      item.id,
    );
  }
});

test("Warsaw wall time: the doubled hour, the skipped hour, bad input", () => {
  // 25 Oct 2026: 03:00 summer time is 02:00 winter time.
  assert.equal(warsawToIso("2026-10-25 01:59:00"), "2026-10-25T01:59:00+02:00");
  assert.equal(warsawToIso("2026-10-25 02:30:00"), "2026-10-25T02:30:00+02:00");
  assert.equal(
    warsawToIso("2026-10-25 02:30:00", "later"),
    "2026-10-25T02:30:00+01:00",
  );
  assert.equal(warsawToIso("2026-10-25 03:00:00"), "2026-10-25T03:00:00+01:00");
  // 29 Mar 2026: 02:00-02:59 never happens.
  assert.equal(warsawToIso("2026-03-29 02:30:00"), "2026-03-29T03:30:00+02:00");
  assert.equal(warsawToIso("2026-02-30 10:00:00"), null);
  assert.equal(warsawToIso("25.10.2026 10:00"), null);
});

test("no warnings: the message object and an empty list", () => {
  assert.deepEqual(parseFeed(JSON.parse(NO_WARNINGS_2026_10_18)), []);
  assert.deepEqual(parseFeed([]), []);
  assert.throws(() => parseFeed({ error: "x" }), /neither a list/);
  assert.throws(() => parseFeed(null), /neither a list/);
});

test("the derived 1809 warning (not real) is found for powiat 1809", () => {
  const items = parseFeed(derived1809(), quiet);
  const ours = forPowiat(items, "1809", EVENING);
  assert.deepEqual(
    ours.map((w) => [w.id, w.level, w.validFrom, w.validTo]),
    [
      [
        DERIVED_1809_ID,
        1,
        "2026-10-25T13:00:00+01:00",
        "2026-10-25T19:00:00+01:00",
      ],
    ],
  );
  assert.equal("teryt" in ours[0], false);
  // Over once it ends.
  const end = Date.parse("2026-10-25T19:00:00+01:00");
  assert.equal(forPowiat(items, "1809", end - 1).length, 1);
  assert.equal(forPowiat(items, "1809", end).length, 0);
});

test("sorted by level, highest first, then by start", () => {
  const [base] = JSON.parse(REAL_2026_10_24);
  const item = (id: string, stopien: string, od: string) => ({
    ...base,
    id,
    stopien,
    obowiazuje_od: od,
    teryt: ["1809"],
  });
  const items = parseFeed([
    item("a", "1", "2026-10-25 08:00:00"),
    item("b", "3", "2026-10-25 12:00:00"),
    item("c", "1", "2026-10-25 06:00:00"),
    item("d", "3", "2026-10-25 09:00:00"),
  ]);
  assert.deepEqual(
    forPowiat(items, "1809", EVENING).map((w) => w.id),
    ["d", "b", "c", "a"],
  );
});

test("a malformed item is skipped and logged, never fatal", () => {
  const [base] = JSON.parse(REAL_2026_10_24);
  const logged: string[] = [];
  const items = parseFeed(
    [
      { ...base, id: "level-0", stopien: "0" },
      { ...base, id: "level-4", stopien: "4" },
      { ...base, id: "level-x", stopien: "pomarańczowy" },
      { ...base, id: "no-time", obowiazuje_od: "" },
      { ...base, id: "bad-teryt", teryt: "1809" },
      { ...base, id: "bad-probability", prawdopodobienstwo: "dużo" },
      { ...base, id: "no-text", tresc: "" },
      "not an object",
      null,
      base,
    ],
    (message) => logged.push(message),
  );
  assert.deepEqual(
    items.map((item) => item.id),
    [base.id],
  );
  assert.equal(logged.length, 9);
  assert.match(logged[1], /level-4: level "4"/);
});

test("fetch: the feed, and every upstream failure throws", async () => {
  const now = () => EVENING;
  const feed = await fetchFeed(IMGW_URL, {
    fetch: answer(REAL_2026_10_24),
    now,
  });
  assert.equal(feed.items.length, 8);
  assert.equal(feed.fetchedAt, "2026-10-24T20:00:00+02:00");
  const empty = await fetchFeed(IMGW_URL, { fetch: answer("[]"), now });
  assert.deepEqual(empty.items, []);
  await assert.rejects(
    fetchFeed(IMGW_URL, { fetch: answer("", 500) }),
    /HTTP 500/,
  );
  await assert.rejects(
    fetchFeed(IMGW_URL, {
      fetch: answer(
        "<!DOCTYPE html><p>Przerwa techniczna</p>",
        200,
        "text/html",
      ),
    }),
    SyntaxError,
  );
  const hang = ((_: unknown, init?: RequestInit) =>
    new Promise((_, reject) =>
      init?.signal?.addEventListener("abort", () =>
        reject(init.signal?.reason),
      ),
    )) as typeof fetch;
  await assert.rejects(fetchFeed(IMGW_URL, { fetch: hang, timeoutMs: 20 }), {
    name: "TimeoutError",
  });
});

test("the feed file: our powiats' items only, round-trips; not one: thrown", () => {
  // The derived feed: 8 items, one of them 1809's; the real one: none.
  const items = parseFeed(derived1809(), quiet);
  const kept = ours(items);
  assert.deepEqual([items.length, kept.length], [8, 1]);
  assert.deepEqual(ours(real()), []);
  assert.ok(kept.every((item) => item.teryt.some((t) => POWIATS.has(t))));
  const feed = { fetchedAt: "2026-10-24T20:00:00+02:00", items: kept };
  assert.deepEqual(parseFeedFile(feedFile(feed)), feed);
  assert.equal(JSON.parse(feedFile(feed)).version, 1);
  assert.equal(parseFeedFile(null), null);
  for (const body of [
    "{",
    "null",
    JSON.stringify({ ...feed, version: 2 }),
    JSON.stringify({ version: 1, fetchedAt: "soon", items: [] }),
    JSON.stringify({ version: 1, fetchedAt: feed.fetchedAt, items: {} }),
  ])
    assert.throws(() => parseFeedFile(body), body);
});

test("the mock's store files: as a good run checkedAgo minutes back left them; a failing mock throws", async () => {
  const now = EVENING;
  const files = await mockFiles("mock:1809?checkedAgo=70", now);
  const feed = parseFeedFile(files.feed);
  assert.equal(Date.parse(feed?.fetchedAt ?? ""), now - 70 * 60_000);
  assert.deepEqual(
    feed?.items.map((item) => item.id),
    [DERIVED_1809_ID],
  );
  assert.deepEqual(parseChecks(files.checks)?.sources[IMGW_KEY], {
    checkedAt: feed?.fetchedAt,
    attemptAt: feed?.fetchedAt,
    ok: true,
  });
  assert.equal(
    Date.parse(
      parseFeedFile((await mockFiles("mock:none", now)).feed)?.fetchedAt ?? "",
    ),
    now,
  );
  await assert.rejects(mockFiles("mock:1809?fail=500", now));
});

test("our powiats come from our gminas: 1809 only", () => {
  assert.deepEqual([...POWIATS], ["1809"]);
});

test("the mock answers from the fixtures, never in production; upstream from the env var", async () => {
  const feed = (url: string) => fetchFeed(url, { fetch: mockFetch });
  assert.deepEqual((await feed("mock:none")).items, []);
  assert.equal((await feed("mock:real")).items.length, 8);
  const now = Date.now();
  for (const level of [1, 2, 3]) {
    const [ours] = forPowiat(
      (await feed(`mock:1809?level=${level}`)).items,
      "1809",
      now,
    );
    assert.equal(ours.level, level);
    assert.ok(Date.parse(ours.validFrom) <= now, "in force now");
    assert.ok(Date.parse(ours.validTo) > now);
  }
  const [upcoming] = forPowiat(
    (await feed("mock:1809?start=upcoming")).items,
    "1809",
    now,
  );
  assert.ok(Date.parse(upcoming.validFrom) > now, "to come");
  const two = forPowiat(
    (await feed("mock:1809?level=2&also=3")).items,
    "1809",
    now,
  );
  assert.deepEqual(
    two.map((w) => w.level),
    [3, 2],
  );
  const three = forPowiat(
    (await feed("mock:1809?also=2,3")).items,
    "1809",
    now,
  );
  assert.deepEqual(
    three.map((w) => w.level),
    [3, 2, 1],
  );
  const [night] = forPowiat(
    (await feed("mock:1809?start=night")).items,
    "1809",
    now,
  );
  assert.equal(night.validFrom.slice(11, 16), "22:00");
  assert.equal(night.validTo.slice(11, 16), "04:00");
  assert.ok(Date.parse(night.validFrom) - now > 3_600_000, "to come");
  await assert.rejects(feed("mock:1809?fail=500"), /HTTP 500/);
  await assert.rejects(feed("mock:1809?fail=html"), SyntaxError);
  await assert.rejects(feed("mock:nothing"), /HTTP 404/);
  const later = new Date(now + 3_600_000).toISOString();
  assert.equal((await feed(`mock:real?failAfter=${later}`)).items.length, 8);
  await assert.rejects(
    feed(`mock:real?failAfter=${new Date(now - 1).toISOString()}`),
    /HTTP 500/,
  );
  await assert.rejects(
    fetchFeed("mock:real?fail=timeout", { fetch: mockFetch, timeoutMs: 20 }),
    { name: "TimeoutError" },
  );
  const env = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "production";
  try {
    await assert.rejects(feed("mock:1809"), /off in production/);
  } finally {
    if (env === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = env;
  }
  // upstream: the env var, and the mock refused in production.
  assert.equal((await upstream({})).url, IMGW_URL);
  assert.equal((await upstream({})).fetch, fetch);
  assert.equal(
    (await upstream({ IMGW_WARNINGS_URL: "https://example.test/w" })).url,
    "https://example.test/w",
  );
  const preview = await upstream({
    IMGW_WARNINGS_URL: "mock:1809",
    VERCEL_ENV: "preview",
  });
  assert.equal(preview.fetch, mockFetch);
  const warn = console.warn;
  console.warn = quiet;
  try {
    const production = await upstream({
      IMGW_WARNINGS_URL: "mock:1809",
      VERCEL_ENV: "production",
    });
    assert.deepEqual(production, { url: IMGW_URL, fetch });
  } finally {
    console.warn = warn;
  }
});

test("the upcoming mock starts and ends on one Warsaw day, whenever it runs", async () => {
  // 00:30, 15:30 and 23:30 in Warsaw on 24 Oct and on 25 Oct (summer time ends).
  const runs = [
    "2026-10-23T22:30:00Z",
    "2026-10-24T13:30:00Z",
    "2026-10-24T21:30:00Z",
    "2026-10-24T22:30:00Z",
    "2026-10-25T14:30:00Z",
    "2026-10-25T22:30:00Z",
  ];
  mock.timers.enable({ apis: ["Date"] });
  try {
    for (const run of runs) {
      const now = Date.parse(run);
      mock.timers.setTime(now);
      const [upcoming] = forPowiat(
        (await fetchFeed("mock:1809?start=upcoming", { fetch: mockFetch }))
          .items,
        "1809",
        now,
      );
      assert.ok(Date.parse(upcoming.validFrom) > now, `${run}: to come`);
      assert.equal(upcoming.validFrom.slice(11, 16), "10:00", run);
      assert.equal(upcoming.validTo.slice(11, 16), "16:00", run);
      assert.equal(
        upcoming.validFrom.slice(0, 10),
        upcoming.validTo.slice(0, 10),
        `${run}: one day`,
      );
    }
  } finally {
    mock.timers.reset();
  }
});

test("unit tests cannot reach the network (scripts/lib/no-network.mjs)", async () => {
  await assert.rejects(fetch(IMGW_URL), /Network is off in unit tests/);
  await assert.rejects(fetchFeed(IMGW_URL), /Network is off in unit tests/);
});
