import assert from "node:assert/strict";
import { test } from "node:test";
import { FetchFailure } from "./live-cron.ts";
import {
  fetchOutages,
  ours,
  outagesFile,
  outagesUrl,
  PGE_URL,
  type PgeOutage,
  parseOutages,
  parseOutagesFile,
  upstream,
} from "./pge-feed.ts";
import {
  derivedOurs,
  FAILURE_2026_11_11,
  FAILURE_ID,
  NO_RANGES_ID,
  REAL_2026_11_11,
  REVOKED_ID,
} from "./pge-fixture.ts";
import { mockFetch, mockFiles } from "./pge-mock.ts";
import { ZUK_PLACES } from "./zuk-places.generated.ts";

const TOKEN = "t0ken-not-real";
const URL_49 = outagesUrl(PGE_URL);

function logger() {
  const lines: Array<Record<string, unknown>> = [];
  return { lines, log: (line: Record<string, unknown>) => lines.push(line) };
}

/** One outage as PGE's list has it (Warsaw wall times), in Basznia Górna. */
const raw = (over: Record<string, unknown> = {}) => ({
  uuid: "u1",
  type: 2,
  startAt: "2026-11-20 08:00:00",
  stopAt: "2026-11-20 20:00:00",
  dateRanges: [
    { startAt: "2026-11-20 08:00:00", stopAt: "2026-11-20 09:00:00" },
  ],
  revoked: false,
  revokedDescription: null,
  addresses: [
    {
      numbers: "1, 2",
      teryt: {
        citySym: "0605950",
        streetSymUl: null,
        cityName: "Basznia Górna",
      },
    },
  ],
  updatedAt: null,
  createdAt: "2026-11-09 13:15:04",
  ...over,
});

const parse = (items: unknown[]) => parseOutages(items, logger().log);

test("the real region-49 list: every item parsed; ours are gmina Lubaczów's only", () => {
  const { lines, log } = logger();
  const items = parseOutages(JSON.parse(REAL_2026_11_11), log);
  assert.equal(items.length, 7);
  assert.deepEqual(lines, []);
  const kept = ours(items, ZUK_PLACES, log);
  // Jędrzejówka (gmina Oleszyce) and Cieszanów's street: not ours.
  assert.deepEqual(
    kept.map((item) => item.uuid.slice(0, 8)),
    ["f76971d9", "77d6b8f2", "bbc4d11d", "4497d8b9", "6fbd5cfd"],
  );
  const two = kept.find((item) => item.uuid.startsWith("4497d8b9"));
  // Two ranges in one day, from dateRanges (not the 08-20 envelope).
  assert.deepEqual(two?.ranges, [
    { start: "2026-11-20T08:00:00+01:00", end: "2026-11-20T09:00:00+01:00" },
    { start: "2026-11-20T19:00:00+01:00", end: "2026-11-20T20:00:00+01:00" },
  ]);
  // Malce (a part of Basznia Górna) is its own SIMC; numbers verbatim.
  assert.deepEqual(
    two?.addresses.map((a) => [a.simc, a.ulic, a.numbers?.slice(0, 12)]),
    [
      ["0605950", null, "100, 100119,"],
      ["0606369", null, "1, 10, 12, 1"],
      ["0605973", null, "1"],
      ["0606100", null, "., 0, 1, 2, "],
    ],
  );
  assert.equal(two?.kind, "planned");
  assert.equal(two?.updatedAt, "2026-11-09T13:15:04+01:00");
  // No numbers at all: null.
  const whole = kept.find((item) => item.uuid.startsWith("6fbd5cfd"));
  assert.equal(whole?.addresses[0].numbers, null);
});

test("a failure (type 1); updatedAt, else createdAt", () => {
  const [item] = parse([JSON.parse(FAILURE_2026_11_11)]);
  assert.equal(item.kind, "failure");
  assert.deepEqual(item.ranges, [
    { start: "2026-11-11T16:03:06+01:00", end: "2026-11-11T18:15:00+01:00" },
  ]);
  assert.equal(item.updatedAt, "2026-11-11T16:03:15+01:00");
  const [updated] = parse([raw({ updatedAt: "2026-11-10 08:57:20" })]);
  assert.equal(updated.updatedAt, "2026-11-10T08:57:20+01:00");
});

test("times: Warsaw wall time; the doubled hour: a start earlier, an end later", () => {
  const [summer] = parse([
    raw({
      dateRanges: [
        { startAt: "2026-07-01 08:00:00", stopAt: "2026-07-01 09:00:00" },
      ],
    }),
  ]);
  assert.equal(summer.ranges[0].start, "2026-07-01T08:00:00+02:00");
  const [doubled] = parse([
    raw({
      dateRanges: [
        { startAt: "2026-10-25 02:30:00", stopAt: "2026-10-25 02:45:00" },
      ],
    }),
  ]);
  assert.deepEqual(doubled.ranges[0], {
    start: "2026-10-25T02:30:00+02:00",
    end: "2026-10-25T02:45:00+01:00",
  });
  // Skipped in March: moved forward an hour.
  const [spring] = parse([
    raw({
      dateRanges: [
        { startAt: "2027-03-28 02:30:00", stopAt: "2027-03-28 04:00:00" },
      ],
    }),
  ]);
  assert.equal(spring.ranges[0].start, "2027-03-28T03:30:00+02:00");
});

test("no dateRanges: the startAt-stopAt envelope, logged", () => {
  const { lines, log } = logger();
  const items = parseOutages(
    [raw({ dateRanges: undefined }), raw({ uuid: "u2", dateRanges: [] })],
    log,
  );
  for (const item of items)
    assert.deepEqual(item.ranges, [
      { start: "2026-11-20T08:00:00+01:00", end: "2026-11-20T20:00:00+01:00" },
    ]);
  assert.deepEqual(lines, [
    { pge: "no-date-ranges", uuid: "u1" },
    { pge: "no-date-ranges", uuid: "u2" },
  ]);
});

test("a malformed item is skipped and logged, never the list", () => {
  const { lines, log } = logger();
  const items = parseOutages(
    [
      raw({ uuid: "" }),
      raw({ uuid: "t", type: 3 }),
      raw({ uuid: "bad", dateRanges: [{ startAt: "x", stopAt: "y" }] }),
      raw({
        uuid: "back",
        dateRanges: [
          { startAt: "2026-11-20 09:00:00", stopAt: "2026-11-20 08:00:00" },
        ],
      }),
      raw({ uuid: "nowhere", addresses: [] }),
      raw({ uuid: "sym", addresses: [{ teryt: { citySym: "123" } }] }),
      "text",
      raw(),
    ],
    log,
  );
  assert.deepEqual(
    items.map((item) => item.uuid),
    ["u1"],
  );
  assert.deepEqual(
    lines.map((line) => line.reason),
    [
      "no uuid",
      "t: type 3",
      "bad: time",
      "back: time",
      "nowhere: addresses",
      "sym: addresses",
      "not an object",
    ],
  );
  // An empty list: no outages, valid.
  assert.deepEqual(parse([]), []);
  // Not a list: the feed fails.
  assert.throws(
    () => parse({ message: "x" } as unknown as unknown[]),
    /not a list/,
  );
});

test("the area: our localities and their streets; an unknown street dropped and logged", () => {
  const { lines, log } = logger();
  const items = parse([
    raw({
      uuid: "mixed",
      addresses: [
        // Rynek, Lubaczów: ours.
        { numbers: "1", teryt: { citySym: "0972447", streetSymUl: "19253" } },
        // A ULIC our snapshot lacks for Lubaczów.
        { numbers: "2", teryt: { citySym: "0972447", streetSymUl: "99999" } },
        // Jędrzejówka: another gmina.
        { numbers: "3", teryt: { citySym: "0606837", streetSymUl: null } },
      ],
    }),
    raw({
      uuid: "away",
      addresses: [
        { numbers: null, teryt: { citySym: "0606837", streetSymUl: null } },
      ],
    }),
  ]);
  const kept = ours(items, ZUK_PLACES, log);
  assert.deepEqual(
    kept.map((item) => [item.uuid, item.addresses.map((a) => a.numbers)]),
    [["mixed", ["1"]]],
  );
  assert.deepEqual(lines, [
    { pge: "street-unknown", uuid: "mixed", simc: "0972447", ulic: "99999" },
  ]);
});

/** A fetch that records its call and answers `response`. */
function answering(response: () => Response | Promise<Response>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const get = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return response();
  }) as typeof fetch;
  return { calls, get };
}

test("fetch: one GET of region 49, the token in X-Auth-Token only", async () => {
  const { calls, get } = answering(() => Response.json([raw()]));
  const feed = await fetchOutages(URL_49, {
    fetch: get,
    token: TOKEN,
    log: () => {},
    now: () => Date.parse("2026-11-11T16:52:00Z"),
  });
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    "https://power-outage.gkpge.pl/api/power-outage?regionIdentifier=49",
  );
  assert.equal(new Headers(calls[0].init?.headers).get("X-Auth-Token"), TOKEN);
  assert.equal(feed.fetchedAt, "2026-11-11T17:52:00+01:00");
  assert.equal(feed.items.length, 1);
});

test("fetch: no token, nothing sent; each failure by its class, the token never in it", async () => {
  const { calls, get } = answering(() => Response.json([]));
  await assert.rejects(
    fetchOutages(URL_49, { fetch: get, token: undefined, log: () => {} }),
    (error) => error instanceof FetchFailure && error.kind === "auth-error",
  );
  assert.equal(calls.length, 0);
  const cases: Array<[() => Response, string]> = [
    [() => new Response("", { status: 401 }), "auth-error"],
    [() => new Response("", { status: 403 }), "auth-error"],
    [() => new Response("", { status: 429 }), "rate-limited"],
    [() => new Response("", { status: 500 }), "fetch-error"],
    [() => new Response("<!DOCTYPE html><title>x</title>"), "fetch-error"],
    [() => Response.json({ message: "invalid" }), "fetch-error"],
  ];
  for (const [response, kind] of cases) {
    const { get: failing } = answering(response);
    await assert.rejects(
      fetchOutages(URL_49, { fetch: failing, token: TOKEN, log: () => {} }),
      (error: Error) => {
        assert.equal(
          error instanceof FetchFailure ? error.kind : "fetch-error",
          kind,
        );
        assert.ok(!error.message.includes(TOKEN));
        return true;
      },
    );
  }
  // No answer: the timeout.
  const hanging = (async (_url: string, init?: RequestInit) =>
    new Promise<Response>((_, reject) =>
      init?.signal?.addEventListener("abort", () =>
        reject(init.signal?.reason),
      ),
    )) as unknown as typeof fetch;
  await assert.rejects(
    fetchOutages(URL_49, {
      fetch: hanging,
      token: TOKEN,
      log: () => {},
      timeoutMs: 10,
    }),
    /timed out|abort/i,
  );
});

test("upstream: the official URL and the token by default; the mock is refused in production", async () => {
  const plain = await upstream({ PGE_API_TOKEN: TOKEN });
  assert.equal(plain.url, URL_49);
  assert.equal(plain.token, TOKEN);
  assert.equal(plain.fetch, fetch);
  const other = await upstream({ PGE_API_URL: "http://127.0.0.1:9/" });
  assert.equal(
    other.url,
    "http://127.0.0.1:9/api/power-outage?regionIdentifier=49",
  );
  assert.equal(other.token, undefined);
  const mocked = await upstream({ PGE_API_URL: "mock:none" });
  assert.equal(mocked.url, "mock:none");
  assert.equal(mocked.fetch, mockFetch);
  const production = await upstream({
    PGE_API_URL: "mock:ours",
    VERCEL_ENV: "production",
  });
  assert.equal(production.url, URL_49);
  assert.equal(production.fetch, fetch);
});

test("the mock: none, real, ours (derived, moved to now), failures; never in production", async () => {
  const get = (url: string, token = "x") =>
    mockFetch(url, { headers: { "X-Auth-Token": token } });
  assert.equal(await (await get("mock:none")).text(), "[]");
  assert.equal(await (await get("mock:real")).text(), REAL_2026_11_11);
  assert.equal((await mockFetch("mock:none")).status, 401);
  for (const [fail, status] of [
    ["500", 500],
    ["401", 401],
    ["429", 429],
  ] as const)
    assert.equal((await get(`mock:ours?fail=${fail}`)).status, status);
  assert.match(await (await get("mock:ours?fail=html")).text(), /DOCTYPE/);
  const now = Date.now();
  const items = parse(JSON.parse(await (await get("mock:ours")).text()));
  const failure = items.find((item) => item.uuid === FAILURE_ID) as PgeOutage;
  // The failure: on now.
  assert.ok(Date.parse(failure.ranges[0].start) <= now);
  assert.ok(Date.parse(failure.ranges[0].end) > now);
  // The planned ones: from tomorrow, clock times kept.
  const planned = items.filter((item) => item.uuid !== FAILURE_ID);
  assert.ok(planned.every((item) => Date.parse(item.ranges[0].start) > now));
  assert.ok(
    planned.some((item) => item.ranges[0].start.slice(11, 16) === "08:00"),
  );
  const before = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "production";
  try {
    await assert.rejects(get("mock:none"), /off in production/);
  } finally {
    process.env.VERCEL_ENV = before;
  }
});

test("the mock's files: ours only, the derived states, the check checkedAgo back", async () => {
  const now = Date.parse("2026-11-11T16:52:00Z");
  const files = await mockFiles("mock:ours?checkedAgo=70", now);
  const feed = parseOutagesFile(files.feed);
  const ids = feed?.items.map((item) => item.uuid) ?? [];
  assert.ok(ids.includes(REVOKED_ID));
  assert.ok(ids.includes(NO_RANGES_ID));
  assert.ok(ids.includes(FAILURE_ID));
  assert.ok(!ids.some((id) => id.startsWith("a11e1eea")));
  assert.equal(
    feed?.items.find((item) => item.uuid === REVOKED_ID)?.revoked,
    true,
  );
  assert.equal(feed?.fetchedAt, "2026-11-11T16:42:00+01:00");
  assert.equal(
    JSON.parse(files.checks).sources.pge.checkedAt,
    "2026-11-11T16:42:00+01:00",
  );
  await assert.rejects(mockFiles("mock:ours?fail=500", now));
  assert.equal(derivedOurs().length, 8);
});

test("the file: written with its version, read back; another version throws", () => {
  const feed = {
    fetchedAt: "2026-11-11T17:52:00+01:00",
    items: parse([raw()]),
  };
  assert.deepEqual(parseOutagesFile(outagesFile(feed)), feed);
  assert.equal(parseOutagesFile(null), null);
  assert.throws(() => parseOutagesFile('{"version":0}'), /not version/);
});
