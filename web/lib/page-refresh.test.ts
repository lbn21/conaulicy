import assert from "node:assert/strict";
import test from "node:test";
import { addDays, todayInWarsaw, warsawToIso } from "./dates.ts";
import { homePage } from "./home-page.ts";
import { feedFile } from "./imgw-warnings.ts";
import { liveReads } from "./live-reads.ts";
import { CHECKS_VERSION, IMGW_KEY, PGE_KEY, waterKey } from "./live-status.ts";
import { CHECKS_PATH, FEED_PATH, PGE_PATH } from "./live-store.ts";
import { type PageDef, SOURCE_TAGS, type SourceTag } from "./page-cache.ts";
import {
  laggingTags,
  type PageDigest,
  pageDigests,
  planRefresh,
  type RefreshDeps,
  refreshPages,
} from "./page-refresh.ts";
import { allPages } from "./pages.ts";
import { outagesFile, type PgeOutage } from "./pge-feed.ts";
import { mockFile, zukFile } from "./water-fixture.ts";
import { WATER_SOURCES } from "./water-sources.ts";

// The live mocks off (CI's job sets them, lib/live-reads.ts): every live
// read from the test's files. Each test file runs in its own process.
for (const name of [
  "IMGW_WARNINGS_URL",
  "PGE_API_URL",
  "ZUK_MOCK",
  "MZGKIM_MOCK",
])
  delete process.env[name];

// The cron's page refresh (lib/page-refresh.ts): every page's digest from
// the files it holds (lib/pages.ts, the made-up dataset), and which pages
// a change re-renders. The clock: this week's Monday, 10:00 in Warsaw, so
// a cut or outage two days on is in the home panel's week.

const today = todayInWarsaw();
const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
const MONDAY = addDays(today, -weekday);
const wall = (day: string, time: string) =>
  Date.parse(warsawToIso(`${day} ${time}`) as string);
const NOW = wall(MONDAY, "10:00:00");
const iso = (ms: number) => new Date(ms).toISOString();

/** ul. Adama Asnyka, the made-up town street with MZGKiM's moved cut. */
const STREET = "0972447-00470";
const hub = `/adres/${STREET}`;

const water = (id: string) =>
  WATER_SOURCES.find((s) => s.id === id)?.pathname as string;

/** Every source checked `ago` ms before NOW. */
/** The status file: every source in `ok`'s state since `ago` ms before NOW. */
function checks(ago = 60_000, ok = true) {
  const since = iso(NOW - ago);
  const keys = [IMGW_KEY, PGE_KEY, ...WATER_SOURCES.map((s) => waterKey(s.id))];
  return JSON.stringify({
    version: CHECKS_VERSION,
    sources: Object.fromEntries(keys.map((key) => [key, { ok, since }])),
  });
}

const DAY_2 = addDays(MONDAY, 2);
const warning = {
  id: "W1",
  event: "Silny wiatr",
  level: 1 as const,
  probability: 80,
  validFrom: iso(NOW - 3_600_000),
  validTo: iso(wall(DAY_2, "18:00:00")),
  text: "Prognozowany silny wiatr.",
  office: "IMGW-PIB",
  published: iso(NOW - 7_200_000),
  teryt: ["1809"],
};
const outage: PgeOutage = {
  uuid: "p1",
  kind: "planned",
  revoked: false,
  revokedNote: null,
  ranges: [
    {
      start: warsawToIso(`${DAY_2} 08:00:00`) as string,
      end: warsawToIso(`${DAY_2} 14:00:00`) as string,
    },
  ],
  addresses: [{ simc: "0972447", ulic: "00470", numbers: "1, 3" }],
  updatedAt: iso(NOW - 7_200_000),
};

/** The files as a quiet run holds them; `over` replaces some. */
function files(over: Record<string, string | null> = {}) {
  const fetchedAt = iso(NOW - 86_400_000);
  const empty = JSON.stringify(zukFile([], fetchedAt));
  return {
    [FEED_PATH]: feedFile({ fetchedAt, items: [] }),
    [PGE_PATH]: outagesFile({ fetchedAt, items: [] }),
    [water("gmina-lubaczow")]: empty,
    [water("mzgkim")]: empty,
    [CHECKS_PATH]: checks(),
    ...over,
  };
}

let defs: PageDef<unknown>[] | undefined;
async function digests(
  bodies: Record<string, string | null>,
  now = NOW,
): Promise<PageDigest[]> {
  defs ??= await allPages();
  return pageDigests(
    defs,
    liveReads(now, async (path) => bodies[path] ?? null),
  );
}

/** The paths whose digest differs between two runs. */
async function changed(
  before: Record<string, string | null>,
  after: Record<string, string | null>,
  nows: [number, number] = [NOW, NOW],
) {
  const [a, b] = await Promise.all([
    digests(before, nows[0]),
    digests(after, nows[1]),
  ]);
  const old = new Map(a.map((p) => [p.path, p.digest]));
  return b.filter((p) => old.get(p.path) !== p.digest).map((p) => p.path);
}

test("the pages: the home page first, every page once", async () => {
  const pages = await digests(files());
  assert.equal(pages[0].path, "/");
  assert.equal(new Set(pages.map((p) => p.path)).size, pages.length);
  for (const path of [hub, `${hub}/woda`, `${hub}/woda.ics`, "/ulice"])
    assert.ok(
      pages.some((p) => p.path === path),
      path,
    );
});

test("the same files: the same digests", async () => {
  assert.deepEqual(await changed(files(), files()), []);
});

test("a re-check and new run ids change no page", async () => {
  const later = iso(NOW - 3_600_000);
  const rewritten = files({
    [FEED_PATH]: feedFile({ fetchedAt: later, items: [] }),
    [PGE_PATH]: outagesFile({ fetchedAt: later, items: [] }),
    [CHECKS_PATH]: checks(5 * 60_000),
  });
  assert.deepEqual(await changed(files(), rewritten), []);
});

test("the files' age alone changes no page; a source's checks failing do", async () => {
  // Hours on the same day, nothing written since: the same pages.
  assert.deepEqual(
    await changed(files(), files(), [NOW, NOW + 8 * 3_600_000]),
    [],
  );
  const failing = files({ [CHECKS_PATH]: checks(10 * 60_000, false) });
  const paths = await changed(files(), failing);
  assert.ok(paths.includes(hub));
  assert.ok(paths.includes(`${hub}/woda`));
  assert.ok(paths.includes(`${hub}/prad`));
});

test("IMGW's notice: every address page and the home page", async () => {
  const warned = files({
    [FEED_PATH]: feedFile({ fetchedAt: iso(NOW), items: [warning] }),
  });
  const pages = await digests(files());
  const hubs = pages
    .map((p) => p.path)
    .filter((path) => /^\/adres\/[^/]+$/.test(path));
  assert.deepEqual(
    (await changed(files(), warned)).sort(),
    ["/", ...hubs].sort(),
  );
});

test("PGE at one place: its address page, /prad and the home page", async () => {
  const cut = files({
    [PGE_PATH]: outagesFile({ fetchedAt: iso(NOW), items: [outage] }),
  });
  assert.deepEqual((await changed(files(), cut)).sort(), [
    "/",
    hub,
    `${hub}/prad`,
  ]);
});

test("water at one place: its page, /woda, woda.ics and the home page", async () => {
  const cut = files({
    [water("mzgkim")]: JSON.stringify(mockFile("5237", NOW)),
  });
  assert.deepEqual((await changed(files(), cut)).sort(), [
    "/",
    hub,
    `${hub}/woda`,
    `${hub}/woda.ics`,
  ]);
});

test("midnight: the pages with day words, not the lists", async () => {
  const late = wall(MONDAY, "23:50:00");
  const early = wall(addDays(MONDAY, 1), "00:10:00");
  const paths = await changed(files(), files(), [late, early]);
  for (const path of [hub, `${hub}/smieci`, `${hub}/woda`, `${hub}/prad`])
    assert.ok(paths.includes(path), path);
  for (const path of ["/ulice", "/sitemap.xml", "/search-index.json"])
    assert.ok(!paths.includes(path), path);
});

// The plan and the run, on made-up digests.

const page = (
  path: string,
  digest: string,
  sources: SourceTag[] = [SOURCE_TAGS.dataset],
) => ({ path, digest, sources }) satisfies PageDigest;

test("the plan: every changed or missing page, every digest now", () => {
  const pages = Array.from({ length: 5 }, (_, i) => page(`/p${i}`, `d${i}`));
  const stored = { "/p0": "d0", "/p1": "old", "/gone": "x" };
  const plan = planRefresh(stored, pages, null);
  assert.deepEqual(plan.changed, ["/p1", "/p2", "/p3", "/p4"]);
  assert.deepEqual(
    plan.next,
    Object.fromEntries(pages.map((p) => [p.path, p.digest])),
  );
});

test("every changed page is queued for warming: no count limit, home first", async () => {
  const pages = [
    page("/", "h"),
    ...Array.from({ length: 2099 }, (_, i) => page(`/p${i}`, "d")),
  ];
  const run = fakeRun({ pages });
  await refreshPages(run.deps);
  assert.equal(run.tags.length, 2100);
  assert.equal(run.tags[0], "page:/");
  assert.deepEqual(
    run.warmed,
    pages.map((p) => p.path),
  );
  assert.deepEqual(run.lines.at(-1), {
    pagesChanged: 2100,
    pagesRevalidated: 2100,
    prewarmed: 2100,
    notWarmed: 0,
    viewsMs: 0,
    warmMs: 0,
  });
  assert.equal(Object.keys(JSON.parse(run.written ?? "{}")).length, 2100);
});

test("pages the function's time did not reach are logged, with the warm time", async () => {
  const pages = Array.from({ length: 10 }, (_, i) => page(`/p${i}`, "d"));
  const run = fakeRun({ pages });
  let now = 0;
  run.deps.clock = () => now;
  run.deps.prewarm = async (paths) => {
    now += 90_000;
    return { warmed: 6, failed: 1, skipped: paths.length - 7 };
  };
  await refreshPages(run.deps);
  const line = run.lines.at(-1);
  assert.equal(line?.prewarmed, 6);
  assert.equal(line?.notWarmed, 3);
  assert.equal(line?.warmFailed, 1);
  assert.equal(line?.warmMs, 90_000);
});

test("the views are worked out during the wait: only the rest is slept", async () => {
  const run = fakeRun({ pages: [page("/", "h")] });
  let now = 1_000;
  run.deps.clock = () => now;
  run.deps.pages = async () => {
    now += 20_000;
    return [page("/", "h")];
  };
  await refreshPages(run.deps);
  assert.deepEqual(run.slept, [45_000]);
  assert.equal(run.lines.at(-1)?.viewsMs, 20_000);
});

test("a run that wrote nothing: no wait", async () => {
  const run = fakeRun({ pages: [page("/", "h")] });
  run.deps.wait = 0;
  await refreshPages(run.deps);
  assert.deepEqual(run.slept, []);
  assert.deepEqual(run.tags, ["page:/"]);
});

test("nothing changed: no wait, no revalidation, no write", async () => {
  const pages = [page("/", "h"), page("/a", "a")];
  const run = fakeRun({ pages, stored: { "/": "h", "/a": "a" } });
  await refreshPages(run.deps);
  assert.deepEqual(run.slept, []);
  assert.deepEqual(run.tags, []);
  assert.equal(run.written, null);
});

test("a revalidation that throws: the digests are not written", async () => {
  const run = fakeRun({ pages: [page("/", "h")] });
  run.deps.revalidateTag = () => {
    throw new Error("down");
  };
  await refreshPages(run.deps);
  assert.equal(run.written, null);
  assert.deepEqual(run.lines.at(-1), { refresh: "error", error: "down" });
});

test("the wait comes before the revalidations", async () => {
  const run = fakeRun({ pages: [page("/", "h")] });
  await refreshPages(run.deps);
  assert.deepEqual(run.order, ["sleep", "page:/", "write"]);
});

test("the dataset revalidated: no page tag, every digest kept", async () => {
  const pages = [page("/", "h"), page("/a", "a")];
  const run = fakeRun({ pages, dataset: true });
  await refreshPages(run.deps);
  assert.deepEqual(run.tags, ["dataset"]);
  assert.deepEqual(JSON.parse(run.written ?? ""), { "/": "h", "/a": "a" });
});

test("the home page lagging: it and its lagging source's pages again", () => {
  const marks = {
    digest: "old",
    dataset: "v1",
    runs: { pge: "r1", imgw: "i1" },
  };
  const runs = { pge: "r2", imgw: "i1" };
  assert.equal(laggingTags(marks, { "/": "old" }, runs), null);
  assert.equal(laggingTags(null, { "/": "new" }, runs), null);
  assert.equal(laggingTags(marks, {}, runs), null);
  const lag = laggingTags(marks, { "/": "new" }, runs);
  assert.deepEqual(lag, ["pge"]);
  const stored = { "/": "h", "/a": "a", "/b": "b" };
  const plan = planRefresh(
    stored,
    [page("/", "h"), page("/a", "a", ["pge"]), page("/b", "b")],
    lag,
  );
  assert.deepEqual(plan.changed, ["/", "/a"]);
});

test("a source this run changed is not lagging when home has the id it read", () => {
  // Home rendered pge "r1", what the run read at its start; the run then
  // wrote "r2". Compared with what it read: not lagging.
  const marks = { digest: "old", dataset: "v1", runs: { pge: "r1" } };
  assert.deepEqual(laggingTags(marks, { "/": "new" }, { pge: "r1" }), []);
  const plan = planRefresh(
    { "/": "h", "/a": "a" },
    [page("/", "h"), page("/a", "a", ["pge"])],
    [],
  );
  assert.deepEqual(plan.changed, ["/"]);
});

test("the home page's view hashes no run id", () => {
  const view = {
    panel: { week: { from: "a", to: "b", until: "c" }, reads: [] },
    examples: [],
    dataset: "v1",
    runs: { pge: "r1" },
  };
  assert.deepEqual(homePage.rendered?.(view), {
    panel: view.panel,
    examples: [],
    dataset: "v1",
  });
});

function fakeRun({
  pages,
  stored = {},
  dataset = false,
}: {
  pages: PageDigest[];
  stored?: Record<string, string>;
  dataset?: boolean;
}) {
  const run = {
    tags: [] as string[],
    warmed: [] as string[],
    slept: [] as number[],
    lines: [] as Record<string, unknown>[],
    order: [] as string[],
    written: null as string | null,
  };
  const deps: RefreshDeps = {
    pages: async () => pages,
    marks: null,
    runs: {},
    read: async () => JSON.stringify(stored),
    write: async (body) => {
      run.written = body;
      run.order.push("write");
    },
    wait: 65_000,
    clock: () => 0,
    sleep: async (ms) => {
      run.slept.push(ms);
      run.order.push("sleep");
    },
    dataset,
    revalidateTag: (tag) => {
      run.tags.push(tag);
      run.order.push(tag);
    },
    prewarm: async (paths) => {
      run.warmed.push(...paths);
      return { warmed: paths.length, failed: 0, skipped: 0 };
    },
    log: (line) => run.lines.push(line),
  };
  return Object.assign(run, { deps });
}
