// npm run config:sync  : rewrites everything derived from etl/sources.yaml.
// npm run config:check : the same, but only reports drift (CI fails on it).
//
// Derived from the one config: docs/data/sources.md (the archive manifest),
// web/lib/config.generated.ts (what the site needs: footer features, each
// gmina's public schedule page), and, checked only, the cron lines of
// .github/workflows/import.yml (GitHub needs literal crons) and the domains
// and adapter types the schema accepts (scripts/import/domains.ts).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import {
  archiveKey,
  type Config,
  cronLines,
  loadConfig,
  ROOT,
  SCHEMA_FILE,
} from "./import/core/config.ts";
import { DOMAINS } from "./import/domains.ts";
import type { WasteSource } from "./import/waste/adapters.ts";

const check = process.argv.includes("--check");
const config = loadConfig();
const drift: string[] = [];

const GENERATED =
  "Generated from etl/sources.yaml by `npm run config:sync`; do not edit.";

export function sourcesMarkdown(c: Config): string {
  const rows = c.archived.map(
    (a) =>
      `| ${a.file} | ${a.origin} | ${a.url ? `<${a.url}>` : "—"} | ${a.fetched} | \`${archiveKey(a)}\` | \`${a.sha256}\` |`,
  );
  return [
    "# Data sources",
    "",
    `<!-- ${GENERATED} -->`,
    "",
    "Raw source files are not in git. They are archived in a private S3 bucket and pulled into a gitignored local cache when the ETL needs them. The sources, their public pages and this list live in `etl/sources.yaml`; this page is generated from it.",
    "",
    `- Bucket: \`${c.archive.bucket}\` (${c.archive.region}): Block Public Access on, versioning on, SSE-S3 encryption, no bucket policy, no ACL grants. Jakub's AWS credentials, and the import's GitHub Actions role (PutObject/GetObject on \`sources/*\` only).`,
    "- Key layout: `sources/<origin>/<fetch date>/<file>`.",
    "- Pull: `cd web && npm run sources:pull` downloads every file below into `.cache/sources/` (repo root, gitignored) and checks its SHA-256. Nothing in the build, CI or the running site needs these files.",
    "- Files the unattended import archives later (docs/import.md) are listed in the database table `source_files`, not here.",
    "- Adding a file by hand: upload it under the same layout, add it to `archived` in `etl/sources.yaml`, run `npm run config:sync` and `npm run sources:pull`.",
    "",
    "`meta` holds our own files about the sources (the inventory snapshot, checksums, the prototype transcription and its samples); the sources themselves are the public documents linked in the table. Public links are always the original pages, never the archive.",
    "",
    "| File | Origin | Public source | Fetched | S3 key | SHA-256 |",
    "|---|---|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}

export function siteModule(c: Config): string {
  // The waste sources' gminy only: another domain's page is not a schedule.
  const pages = Object.fromEntries(
    c.sources
      .filter((s) => s.domain === "waste")
      .map((s) => [(s as WasteSource).waste.gmina.teryt, s.page]),
  );
  return [
    `// ${GENERATED}`,
    "// The site's share of the one config: no constant here is written by hand.",
    "",
    "/** Footer navigation: live features only; shown once there are 2+ links. */",
    `export const FEATURES: Array<{ section: string; links: Array<{ href: string; text: string }> }> = ${JSON.stringify(c.site.features, null, 2)};`,
    "",
    "/** Each gmina's public schedule page by TERYT (never the archive). */",
    `export const GMINA_SCHEDULE_PAGES: Record<string, string> = ${JSON.stringify(pages, null, 2)};`,
    "",
  ].join("\n");
}

function sync(file: string, content: string) {
  const target = path.join(ROOT, file);
  const current = existsSync(target) ? readFileSync(target, "utf8") : "";
  if (current === content) return;
  if (check) drift.push(`${file} is stale: run \`npm run config:sync\``);
  else {
    writeFileSync(target, content);
    console.log(`wrote ${file}`);
  }
}

sync("docs/data/sources.md", sourcesMarkdown(config));
sync("web/lib/config.generated.ts", siteModule(config));

// The workflow's crons must be exactly those the schedule implies.
const workflow = parseYaml(
  readFileSync(path.join(ROOT, ".github/workflows/import.yml"), "utf8"),
) as {
  on: { schedule?: Array<{ cron: string }> };
};
const actual = (workflow.on.schedule ?? []).map((s) => s.cron).sort();
const expected = cronLines(config.schedule).sort();
if (actual.join("|") !== expected.join("|"))
  drift.push(
    `.github/workflows/import.yml crons [${actual.join(", ")}] do not match schedule in etl/sources.yaml: ${
      expected.length
        ? `expected\n    on:\n      schedule:\n${expected.map((c) => `        - cron: "${c}"`).join("\n")}`
        : "expected no schedule (schedule.enabled: false)"
    }`,
  );

// The schema accepts exactly the domains and adapter types that exist.
const schema = JSON.parse(readFileSync(SCHEMA_FILE, "utf8"));
const item = schema.properties.sources.items.properties;
const domains = Object.values(DOMAINS);
for (const [name, enumerated, registered] of [
  ["domain", item.domain.enum, Object.keys(DOMAINS)],
  [
    "detect.type",
    item.detect.properties.type.enum,
    domains.flatMap((d) => Object.keys(d.detectors)),
  ],
  [
    "extract.type",
    item.extract.properties.type.enum,
    domains.flatMap((d) => Object.keys(d.extractors)),
  ],
] as const)
  if ([...enumerated].sort().join() !== [...registered].sort().join())
    drift.push(
      `etl/sources.schema.json ${name} [${enumerated}] ≠ registered [${registered}]`,
    );

if (drift.length) {
  console.log(drift.map((d) => `FAIL  ${d}`).join("\n"));
  process.exit(1);
}
console.log(
  check ? "Config: valid, nothing derived has drifted." : "Config: in sync.",
);
