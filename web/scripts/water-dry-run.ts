// npm run water:dry-run -- --source mzgkim --file post.txt
//   [--title "Przerwa w dostawie wody"] [--published 2026-10-02T12:11:39]
//   [--id 5237] [--link https://…] [--ai reading.json] [--districts seed|db]
// npm run water:dry-run -- --case 39885 [--ai reading.json] [--districts …]
//
// One post through the model and the gate as the water cron reads it
// (scripts/lib/water-dry-run.ts), printed as JSON: the model's reading and
// what the gate makes of it. Writes nothing: no Blob, no database, no
// cache. --file is the post's text or HTML (a page's article is fine);
// --ai a saved model JSON to gate again without a call, else the model is
// called with XAI_API_KEY (from .env.local). --districts db reads the
// gazetteer from DATABASE_URL; the default is the seed in the code.
// --case runs a prompt regression case (lib/water-cases.ts): its post and
// source, and its expected reading printed next to the model's.
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import type { District } from "../lib/districts.ts";
import { DISTRICTS } from "../lib/districts-seed.ts";
import { gminaLubaczow } from "../lib/sources/gmina-lubaczow/index.ts";
import { mzgkim } from "../lib/sources/mzgkim/index.ts";
import { WATER_CASES } from "../lib/water-cases.ts";
import { type AiResult, parseAiResult, readWithAi } from "../lib/zuk-ai.ts";
import { ZUK_PLACES } from "../lib/zuk-places.generated.ts";
import { fail } from "./lib/import-data.ts";
import { waterDryRun } from "./lib/water-dry-run.ts";

const { values: args } = parseArgs({
  options: {
    source: { type: "string", default: "mzgkim" },
    file: { type: "string" },
    title: { type: "string", default: "Przerwa w dostawie wody" },
    published: { type: "string" },
    id: { type: "string", default: "0" },
    link: { type: "string", default: "https://example.invalid/dry-run" },
    ai: { type: "string" },
    districts: { type: "string", default: "seed" },
    case: { type: "string" },
  },
});

const sources = { mzgkim, "gmina-lubaczow": gminaLubaczow };
const regression = args.case
  ? WATER_CASES.find((c) => c.id === Number(args.case))
  : undefined;
if (args.case && !regression)
  fail(`--case is one of: ${WATER_CASES.map((c) => c.id).join(", ")}`);
const source =
  sources[(regression?.source ?? args.source) as keyof typeof sources];
if (!source) fail(`--source is one of: ${Object.keys(sources).join(", ")}`);
if (!regression && !args.file)
  fail("--file <the post's text or HTML> is required.");
const published =
  args.published ??
  new Date()
    .toLocaleString("sv-SE", { timeZone: "Europe/Warsaw" })
    .replace(" ", "T");

let districts: District[] = DISTRICTS;
if (args.districts === "db") {
  // Only here: it needs DATABASE_URL.
  const { loadDistricts } = await import("../lib/districts-db.ts");
  districts = await loadDistricts();
} else if (args.districts !== "seed") fail("--districts is seed or db.");

let ai: AiResult | undefined;
if (args.ai) {
  ai = parseAiResult(readFileSync(args.ai, "utf8")) ?? undefined;
  if (!ai) fail(`${args.ai} is not the model's schema.`);
}

const run = await waterDryRun({
  post: regression?.post() ?? {
    id: Number(args.id),
    date: published,
    modified: published,
    link: args.link,
    title: { rendered: args.title },
    content: { rendered: readFileSync(args.file as string, "utf8") },
  },
  source,
  places: { ...ZUK_PLACES, districts },
  ai,
  readAi: readWithAi,
  xaiKey: process.env.XAI_API_KEY,
});
console.log(
  JSON.stringify(
    regression
      ? {
          case: regression.id,
          trap: regression.trap,
          expected: regression.expected(),
          ...run,
        }
      : run,
    null,
    2,
  ),
);
process.exit(0);
