// Grok's real replies (fixtures.ts) through the waste import (task 191):
// each correct one reproduces the database's 2026 rows and events exactly,
// with no finding, and still opens a blocking review PR; the S2 slips pass
// every literal check, so only their review PR shows them, and nothing
// applies until a merged review says what is right. xAI, the database and
// GitHub are mocked; nothing reaches the network.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { parse as parseYaml, stringify } from "yaml";
import { ZUK_MODEL } from "../../../lib/zuk-ai.ts";
import { ZUK_PLACES } from "../../../lib/zuk-places.generated.ts";
import { loadConfig } from "../core/config.ts";
import type { Queryable } from "../core/db.ts";
import { Issues } from "../core/issues.ts";
import { Reviews } from "../core/review.ts";
import {
  type Extracted,
  type Found,
  type WasteSource,
  wasteAi,
} from "./adapters.ts";
import { check } from "./check.ts";
import { EXPECTED_2026 } from "./expected.ts";
import { FIXTURES, fixtureFetcher } from "./fixtures.ts";
import { databaseRows, LAYOUT_ROWS, memberLists } from "./lib.ts";
import { type Layout, schedulePrompt } from "./prompts.ts";

const dir = mkdtempSync(path.join(tmpdir(), "waste-fixtures-"));
process.env.REVIEWS_FILE = path.join(dir, "reviews.json");
process.env.IMPORT_REVIEW_DIR = path.join(dir, "review");
const config = loadConfig();
const SOURCES = Object.fromEntries(
  config.sources.map((s) => [s.extract.layout, s as WasteSource]),
) as Record<Layout, WasteSource>;
// The source site, for the PR's "is the image still the same" check.
const http = { get: async () => new Response("served") };
const issues = new Issues();
const TINY_PNG = Buffer.from("png");

/** The review PRs so far (REVIEWS_FILE). */
const reviewPrs = () =>
  existsSync(process.env.REVIEWS_FILE as string)
    ? (JSON.parse(
        readFileSync(process.env.REVIEWS_FILE as string, "utf8"),
      ) as Array<{
        title: string;
        body: string;
        state: string;
        files: Record<string, string>;
      }>)
    : [];

const sha256 = (text: string) =>
  createHash("sha256").update(text).digest("hex");

test("fixtures: each reply byte for byte as Grok gave it (sha256 pinned)", () => {
  const pinned: Record<string, string> = {
    "miasto-s1":
      "0444483cd7485da8f8e011efbf8059125bf7e7a68fb25e16f52e43e52067c69a",
    "miasto-s2":
      "be6ee5cb9513a8626a91246b89a4938600273287be4fa9e920d4796a593644b3",
    "gmina-s1":
      "8e6fdca80709ca6b01c8ea96c4362cab83e073069f365cd44c3e4d43399da96a",
    "gmina-s2":
      "b5d92ffedd5139403b3503faa14fb3733cf035fe0c083c161b35b9ddfb408cdd",
    "gmina-s3":
      "49d121847406a823d298a4b38d158c39ef0a634997d4c69db2854eb2581a76f9",
    "gmina-s4":
      "097dd79c6baaefd772d1f73da775a8295a547842e805baa7f6167e666d971d53",
    "gmina-s5":
      "e247548c1d0e86222e4252f704996989c0bc685cbceb0396f8e2c729ab01d815",
    // The two slip runs answered the same bytes.
    "miasto-s2-slip-r1":
      "34fcfdbbbeac84a499770383abf734774beb0410f968702ca0000ac8c0a8367f",
    "miasto-s2-slip-r2":
      "34fcfdbbbeac84a499770383abf734774beb0410f968702ca0000ac8c0a8367f",
  };
  assert.deepEqual(Object.keys(FIXTURES), Object.keys(pinned));
  for (const [name, digest] of Object.entries(pinned))
    assert.equal(sha256(FIXTURES[name].content), digest, name);
});

/** The zone's file as the detector finds it, and its body's sha256. */
function fileOf(zone: string, layout: Layout, sector: number) {
  const { source_doc, source_sha256 } = EXPECTED_2026[zone];
  const file: Found = {
    name: source_doc,
    url: `https://example.test/${source_doc}`,
    mediaId: null,
    modified: null,
    sector,
    year: 2026,
  };
  return { file, digest: source_sha256, layout };
}

/** The database as production had it on 21 Oct 2026 for this zone. */
function productionDb(zone: string, layout: Layout): Queryable {
  const { rows, members } = EXPECTED_2026[zone];
  const fractions = LAYOUT_ROWS[layout];
  const events = Object.entries(rows).flatMap(([row, months]) =>
    months.flatMap((days, i) =>
      days.map((day) => ({
        subtype: fractions[row][0],
        start: `2026-${String(i + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      })),
    ),
  );
  // What the members queries return: villages by SIMC, streets by teryt.
  const listed =
    layout === "gmina"
      ? ZUK_PLACES.localities
          .filter(
            (l) =>
              l.kind === "wies" &&
              members.some(([id, street]) => id === l.id && street === null),
          )
          .map((l) => ({ id: l.id, name: l.name }))
      : ZUK_PLACES.streets
          .filter((s) => members.some(([, street]) => street === s.id))
          .map((s) => ({ id: s.id.slice("0972447-".length), name: s.name }));
  return {
    query: async (text: string) => {
      const result = (rows: unknown[]) =>
        ({ rows }) as Awaited<ReturnType<Queryable["query"]>>;
      if (text.includes("count(distinct substr")) return result([]);
      if (text.startsWith("select subtype, start from events"))
        return result(events);
      if (text.includes("zone_members")) return result(listed);
      throw new Error(`unexpected query: ${text}`);
    },
  };
}

/** xAI that must not be called: it fails the test if it is. */
const unreachable = (async () => {
  throw new Error("xAI was called");
}) as unknown as typeof fetch;

/** One run: a fresh Reviews (its holds are per run), the reading, the check. */
async function readAndCheck(
  fetcher: typeof fetch,
  zone: string,
  layout: Layout,
) {
  const reviews = new Reviews(http);
  const sector = Number(zone.at(-1));
  const { file, digest } = fileOf(zone, layout, sector);
  const source = SOURCES[layout];
  const out = await wasteAi({
    fetcher,
    apiKey: "test-key",
    render: () => TINY_PNG,
  })({
    source,
    file,
    body: Buffer.from(zone),
    doc: file.name,
    digest,
    reviews,
  });
  const db = productionDb(zone, layout);
  const problems = await check({
    db,
    config,
    source,
    file,
    digest,
    out,
    zoneName: `Strefa ${zone}`,
    issues,
    reviews,
    dryRun: false,
    runUrl: "",
  });
  return { out, problems, held: reviews.held(digest) };
}

const CORRECT: Array<[string, string, Layout]> = [
  ["miasto-s1", "waste:miasto-s1", "miasto"],
  ["miasto-s2", "waste:miasto-s2", "miasto"],
  ["gmina-s1", "waste:gmina-s1", "gmina"],
  ["gmina-s2", "waste:gmina-s2", "gmina"],
  ["gmina-s3", "waste:gmina-s3", "gmina"],
  ["gmina-s4", "waste:gmina-s4", "gmina"],
  ["gmina-s5", "waste:gmina-s5", "gmina"],
];

for (const [name, zone, layout] of CORRECT)
  test(`${name}: the database's rows and events, no finding, a blocking review PR all the same`, async () => {
    const before = reviewPrs().length;
    const { out, problems, held } = await readAndCheck(
      fixtureFetcher(name),
      zone,
      layout,
    );
    const expected = EXPECTED_2026[zone];
    assert.deepEqual(
      databaseRows(out.events, LAYOUT_ROWS[layout]),
      expected.rows,
    );
    assert.equal(out.events.length, expected.events);
    assert.equal(out.reviewed, false);
    assert.deepEqual(out.read?.findings, []);
    assert.deepEqual(
      memberLists(
        out.read?.reading?.places ?? [],
        (await productionDb(zone, layout).query("select … from zone_members …"))
          .rows as Array<{ id: string; name: string }>,
      ),
      { notInZone: [], notOnFile: [], noId: [] },
    );
    // Equal to the database and clean, and still: nothing applies until a
    // person merges the review.
    assert.deepEqual(problems, []);
    assert.equal(held?.blocks, true);
    assert.match(held?.note ?? "", /^a new schedule; its review PR: /);
    const all = reviewPrs();
    assert.equal(all.length, before + 1);
    const pr = all.at(-1);
    assert.equal(
      pr?.title,
      `[import] Strefa ${zone}: nowy harmonogram do sprawdzenia (${expected.source_doc})`,
    );
    assert.ok(pr?.body.includes("- wszystkie przeszły"));
    assert.ok(!pr?.body.includes("**różnica**"));
    assert.ok(pr?.body.includes("**Bez id (null):**\n\n- brak"));
  });

test("the S2 slips: every literal check passes, the review shows September and October, nothing applies", async () => {
  for (const name of ["miasto-s2-slip-r1", "miasto-s2-slip-r2"]) {
    // S2 on first sight (its own review PRs file), read wrong.
    process.env.REVIEWS_FILE = path.join(dir, `reviews-${name}.json`);
    const { out, problems, held } = await readAndCheck(
      fixtureFetcher(name),
      "waste:miasto-s2",
      "miasto",
    );
    assert.deepEqual(out.read?.findings, []);
    assert.deepEqual(problems, []);
    assert.equal(held?.blocks, true);
    assert.ok(out.events.length > 0);
    const [pr] = reviewPrs();
    const body = pr?.body ?? "";
    const bulky = "wielkogabarytowe+elektro+opony+tekstylia";
    assert.ok(
      body.includes(
        `| ${bulky} | wrzesień | WRZESIEŃ | — | 16 | **różnica** |`,
      ),
    );
    assert.ok(
      body.includes(
        `| ${bulky} | październik | PAŹDZIERNIK | 16 | — | **różnica** |`,
      ),
    );
    assert.equal(body.split("**różnica**").length - 1, 2);
    // Each slip opened one review PR in its own file (r1's and r2's).
    assert.equal(reviewPrs().length, 1, name);
  }
});

test("a merged review of the slip, corrected by a person: its days apply, no new PR", async () => {
  const pr = reviewPrs().find((p) =>
    p.title.includes("harmonogram-2026-s2.jpg"),
  );
  const key = "etl/review/miasto/harmonogram-2026-s2.yaml";
  const reviewed = parseYaml(pr?.files[key] ?? "");
  const bulky = reviewed.rows["wielkogabarytowe+elektro+opony+tekstylia"];
  assert.deepEqual([bulky.wrzesień, bulky.październik], [[], [16]]);
  bulky.wrzesień = [16];
  bulky.październik = [];
  const target = path.join(
    process.env.IMPORT_REVIEW_DIR as string,
    "miasto/harmonogram-2026-s2.yaml",
  );
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, stringify(reviewed));
  const count = reviewPrs().length;
  // No call to xAI at all: the merged file replaces the reading.
  const { out, problems, held } = await readAndCheck(
    unreachable,
    "waste:miasto-s2",
    "miasto",
  );
  assert.equal(out.reviewed, true);
  assert.equal(out.read, undefined);
  assert.deepEqual(
    databaseRows(out.events, LAYOUT_ROWS.miasto),
    EXPECTED_2026["waste:miasto-s2"].rows,
  );
  assert.deepEqual(problems, []);
  assert.equal(held, null);
  assert.equal(reviewPrs().length, count);
});

test("an open review of this sha256: no xAI call, the PR left exactly as it is", async () => {
  process.env.REVIEWS_FILE = path.join(dir, "reviews.json");
  const before = readFileSync(process.env.REVIEWS_FILE, "utf8");
  const { out, problems, held } = await readAndCheck(
    unreachable,
    "waste:gmina-s2",
    "gmina",
  );
  assert.equal(out.pending?.state, "open");
  assert.equal(out.read, undefined);
  assert.deepEqual(problems, []);
  assert.equal(held?.blocks, true);
  assert.match(held?.note ?? "", /^waiting for its review PR: /);
  assert.equal(readFileSync(process.env.REVIEWS_FILE, "utf8"), before);
});

test("no reading and no merged review: held, never applied", async () => {
  process.env.REVIEWS_FILE = path.join(dir, "reviews.json");
  const before = readFileSync(process.env.REVIEWS_FILE, "utf8");
  const reviews = new Reviews(http);
  const zone = "waste:gmina-s3";
  const { file, digest } = fileOf(zone, "gmina", 3);
  const out: Extracted = {
    zoneId: zone,
    scope: { from: "2026-01-01", to: "2026-12-31" },
    year: 2026,
    events: [],
    listed: [],
    problems: [],
    reviewed: false,
  };
  const problems = await check({
    db: productionDb(zone, "gmina"),
    config,
    source: SOURCES.gmina,
    file,
    digest,
    out,
    zoneName: zone,
    issues,
    reviews,
    dryRun: false,
    runUrl: "",
  });
  assert.deepEqual(problems, []);
  assert.deepEqual(reviews.held(digest), {
    note: "neither a reading nor a merged review; nothing applies",
    blocks: true,
  });
  assert.equal(readFileSync(process.env.REVIEWS_FILE, "utf8"), before);
});

test("a rejected review keeps the database; a merged one not checked out yet waits", async () => {
  process.env.REVIEWS_FILE = path.join(dir, "reviews.json");
  const doc = EXPECTED_2026["waste:gmina-s1"].source_doc;
  const decide = (state: string) => {
    const all = reviewPrs();
    const pr = all.find((p) => p.title.includes(doc));
    assert.ok(pr);
    pr.state = state;
    writeFileSync(process.env.REVIEWS_FILE as string, JSON.stringify(all));
  };
  const count = reviewPrs().length;
  decide("closed");
  // Neither costs an xAI call.
  const rejected = await readAndCheck(unreachable, "waste:gmina-s1", "gmina");
  assert.equal(rejected.held?.blocks, false);
  assert.match(rejected.held?.note ?? "", /its review was rejected/);
  decide("merged");
  const merged = await readAndCheck(unreachable, "waste:gmina-s1", "gmina");
  assert.equal(merged.held?.blocks, true);
  assert.match(merged.held?.note ?? "", /merged .* but not in this checkout/);
  assert.equal(reviewPrs().length, count);
});

test("a rejected review of another reading (another prompt, or none recorded): read again, a new review PR", async () => {
  process.env.REVIEWS_FILE = path.join(dir, "reviews.json");
  const now = `prompt:${sha256(schedulePrompt("gmina").text)} model:${ZUK_MODEL}`;
  const cases: Array<[string, string, string]> = [
    // A PR read with another prompt; one from before prompts were recorded.
    ["waste:gmina-s3", now, `prompt:${"0".repeat(64)} model:${ZUK_MODEL}`],
    ["waste:gmina-s4", ` ${now}`, ""],
  ];
  for (const [zone, from, to] of cases) {
    const doc = EXPECTED_2026[zone].source_doc;
    const all = reviewPrs();
    const old = all.find((p) => p.title.includes(doc));
    assert.ok(old);
    assert.ok(old.body.includes(now), "the PR records the prompt and model");
    old.state = "closed";
    old.body = old.body.replace(from, to);
    writeFileSync(process.env.REVIEWS_FILE, JSON.stringify(all));
    const { out, problems, held } = await readAndCheck(
      fixtureFetcher(`gmina-s${zone.at(-1)}`),
      zone,
      "gmina",
    );
    assert.ok(out.read, zone);
    assert.deepEqual(problems, []);
    assert.equal(held?.blocks, true);
    assert.match(held?.note ?? "", /^a new schedule; its review PR: /);
    const after = reviewPrs();
    assert.equal(after.length, all.length + 1, zone);
    const pr = after.at(-1);
    assert.ok(pr);
    assert.equal(pr.state, "open");
    assert.ok(pr.title.includes(doc));
    assert.ok(pr.body.includes(` ${now} -->`), zone);
    // That one rejected too: same prompt and model, so held, no xAI call.
    pr.state = "closed";
    writeFileSync(process.env.REVIEWS_FILE, JSON.stringify(after));
    const again = await readAndCheck(unreachable, zone, "gmina");
    assert.equal(again.out.pending?.state, "rejected");
    assert.equal(again.held?.blocks, false);
    assert.equal(reviewPrs().length, after.length);
  }
});
