// The street check reads only vision.streetCheckFrom's pass (opus): grok-a's
// street misreadings open nothing; a real difference in opus's list still
// opens the informational review PR. The real Grok S4 reply, two passes
// mocked (CURSOR_AGENT_MOCK), the database and GitHub replaced.
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { loadConfig } from "../core/config.ts";
import type { Queryable } from "../core/db.ts";
import type { Issues } from "../core/issues.ts";
import type { ReviewRequest, Reviews } from "../core/review.ts";
import { extractJson } from "../core/vision.ts";
import { EXTRACTORS, type Found, type WasteSource } from "./adapters.ts";
import { check } from "./check.ts";
import { streetReview } from "./lib.ts";
import { DB_STREETS, GROK_RESULTS } from "./vision-fixture.ts";

const config = loadConfig();
const source = config.sources.find((s) => s.id === "miasto") as WasteSource;
const zone = "waste:miasto-s4";
const members = DB_STREETS[zone].map((n) => ({ id: n, name: n }));
const mock = mkdtempSync(path.join(tmpdir(), "street-check-"));
process.env.CURSOR_AGENT_MOCK = mock;
process.env.IMPORT_REVIEW_DIR = mkdtempSync(path.join(tmpdir(), "review-"));

// grok-a (pass 1) misreads two streets; opus (pass 2) has the same dates.
const grok = JSON.parse(extractJson(GROK_RESULTS[3]));
grok.streets = grok.streets.map((s: string) =>
  s === "Mały Łązek"
    ? "Mały Łączek"
    : s === "Gen. Antoniego Jeziorskiego"
      ? "Gen. Antoniego Jezierskiego"
      : s,
);

async function run(opusStreets: string[]) {
  const passes = [grok, { ...grok, streets: opusStreets }];
  passes.forEach((p, i) => {
    writeFileSync(
      path.join(mock, `miasto-s4-2026.pass-${i + 1}.json`),
      JSON.stringify(p),
    );
  });
  const file: Found = {
    name: "harmonogram-2026-s4.jpg",
    url: "https://example.org/s4.jpg",
    mediaId: 1,
    modified: null,
    sector: 4,
    year: 2026,
  };
  const out = await EXTRACTORS["miasto-jpg-vision"]({
    source,
    config,
    file,
    body: Buffer.from("JPEG"),
    doc: file.name,
    digest: "ab".repeat(32),
  });
  const opened: ReviewRequest[] = [];
  const reviews = {
    status: () => ({
      open: null,
      sameOpen: null,
      rejected: null,
      merged: null,
    }),
    open: async (req: ReviewRequest) => {
      opened.push(req);
      return "https://github.com/test/pull/1";
    },
    supersede: () => {},
    hold: () => {},
    held: () => null,
  } as unknown as Reviews;
  const db: Queryable = {
    query: async (sql: string) => ({
      rows: sql.includes("zone_members") ? members : [],
    }),
  } as unknown as Queryable;
  await check({
    db,
    config,
    source,
    file,
    digest: "ab".repeat(32),
    out,
    zoneName: "Miasto Lubaczów, sektor 4",
    issues: {} as Issues,
    reviews,
    dryRun: false,
    runUrl: "",
  });
  return { out, opened };
}

test("grok-a misreads S4 streets, opus reads them right: no finding, no review PR", async () => {
  // Checked as before (every pass), grok-a's misreadings would flag.
  const asBefore = streetReview(
    zone,
    [grok.streets],
    members.map((m) => ({ id: m.id, names: [m.name] })),
    source.waste.aliases,
    ["grok-a"],
  );
  assert.ok(asBefore.some((f) => f.includes("Mały Łączek")));
  assert.ok(asBefore.some((f) => f.includes("Jezierskiego")));

  const { out, opened } = await run(DB_STREETS[zone]);
  assert.equal((out as { disagree?: boolean }).disagree, false);
  assert.deepEqual(opened, []);
});

test("a real difference in opus's street list still opens the review PR", async () => {
  const opus = [
    ...DB_STREETS[zone].filter((s) => s !== "Akacjowa"),
    "Nowa Testowa",
  ];
  const { opened } = await run(opus);
  assert.equal(opened.length, 1);
  assert.match(opened[0].title, /ulice do sprawdzenia/);
  assert.match(opened[0].markdown, /„Nowa Testowa”.*\(przebieg opus\)/);
  assert.match(opened[0].markdown, /„Akacjowa”.*\(przebieg opus\)/);
  assert.doesNotMatch(opened[0].markdown, /grok-a/);
});
