// node scripts/check-teryt.ts [--teryt <dir>] [--ours <dir>] [--issue]
//
// Compares our places with GUS TERYT, the one source of place and street
// names (CLAUDE.md), for every gmina in etl/sources.yaml (each source's
// <domain>.gmina.teryt, so a new gmina is checked as soon as it is
// configured), by id: new streets and localities (D), renamed or re-typed
// ones (M), removed ones (U; a rename is a U plus a D, as SYM_UL names the
// name, scripts/lib/teryt.ts). It never writes places: waste zones map
// streets by name, so a person reviews every change (docs/database.md:
// the import, then scripts/place-redirect.ts for a renamed street).
//
// TERYT: the full ULIC and SIMC files ("urzędowy" variant), downloaded once
// per run from eTERYT's public page (an ASP.NET form: one GET, one POST
// per file); --teryt <dir> reads ULIC_*.csv and SIMC_*.csv instead. Full
// files rather than TERYT's update files: a diff by id needs no record of
// when we last looked, and a missed day loses nothing. When anything
// changed, our gminy's rows are archived in S3 (sources/teryt/<day>/).
//
// Ours: the database, read-only (IMPORT_DATABASE_URL, DATABASE_URL_UNPOOLED
// or DATABASE_URL); --ours <dir> builds them from the TERYT files our data
// was imported from (e.g. ../.cache/sources/teryt/2026-10-18).
//
// --issue (the import workflow): one open review issue while TERYT differs
// (a new difference replaces it), closed when it matches again; a failed
// download is an issue too. Exit 0. Without --issue: print, exit 1 on any
// difference.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { todayInWarsaw } from "../lib/dates.ts";
import { archive } from "./import/core/archive.ts";
import { gminaTercs, loadConfig } from "./import/core/config.ts";
import { Db } from "./import/core/db.ts";
import { sha256 } from "./import/core/hash.ts";
import { Issues } from "./import/core/issues.ts";
import { databaseUrl } from "./lib/local-db.ts";
import {
  changesTable,
  type Ours,
  oursFromTeryt,
  parseSimc,
  parseUlic,
  type SimcRow,
  terytDiff,
  type UlicRow,
} from "./lib/teryt.ts";

const PAGE =
  "https://eteryt.stat.gov.pl/eTeryt/rejestr_teryt/udostepnianie_danych/baza_teryt/uzytkownicy_indywidualni/pobieranie/pliki_pelne.aspx";
// The page's download links (__doPostBack targets), official variant.
const TARGETS = {
  ULIC: "ctl00$body$BULICUrzedowyPobierz",
  SIMC: "ctl00$body$BSIMCUrzedowyPobierz",
};

const { values: args } = parseArgs({
  options: {
    teryt: { type: "string" },
    ours: { type: "string" },
    issue: { type: "boolean", default: false },
  },
});

const config = loadConfig(process.env.IMPORT_CONFIG || undefined);
const issues = new Issues();
const today = todayInWarsaw();

const tercs = gminaTercs(config);

type Files = { ULIC: string; SIMC: string };

function readDir(dir: string): Files {
  const read = (prefix: string) =>
    readdirSync(dir)
      .filter((f) => f.startsWith(prefix) && f.endsWith(".csv"))
      .map((f) => readFileSync(path.join(dir, f), "utf8"));
  // Several files (one per gmina): one header kept.
  const join = (texts: string[]) =>
    texts
      .map((t, i) => (i === 0 ? t : t.slice(t.indexOf("\n") + 1)))
      .join("\n");
  return { ULIC: join(read("ULIC_")), SIMC: join(read("SIMC_")) };
}

const field = (html: string, name: string) =>
  new RegExp(`name="${name.replaceAll("$", "\\$")}"[^>]*value="([^"]*)"`)
    .exec(html)?.[1]
    ?.replaceAll("&amp;", "&") ?? "";

/** The two full files from eTERYT: one GET, then one POST per file. */
async function download(): Promise<Files> {
  const headers = { "User-Agent": `conaulicy-teryt (+${config.site.url})` };
  const page = await fetch(PAGE, {
    headers,
    signal: AbortSignal.timeout(60_000),
  });
  if (!page.ok) throw new Error(`GET ${PAGE}: HTTP ${page.status}`);
  const html = await page.text();
  const cookie = page.headers.getSetCookie().map((c) => c.split(";")[0]);
  const dir = mkdtempSync(path.join(tmpdir(), "teryt-"));
  const files = {} as Files;
  for (const [name, target] of Object.entries(TARGETS) as Array<
    [keyof Files, string]
  >) {
    const form = new URLSearchParams({
      __EVENTTARGET: target,
      __EVENTARGUMENT: "",
      __VIEWSTATE: field(html, "__VIEWSTATE"),
      __VIEWSTATEGENERATOR: field(html, "__VIEWSTATEGENERATOR"),
      ctl00$body$TBData: field(html, "ctl00$body$TBData"),
    });
    const response = await fetch(PAGE, {
      method: "POST",
      headers: { ...headers, Cookie: cookie.join("; ") },
      body: form,
      signal: AbortSignal.timeout(300_000),
    });
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || !type.includes("zip"))
      throw new Error(`${name}: HTTP ${response.status}, ${type}, not a zip`);
    const zip = path.join(dir, `${name}.zip`);
    writeFileSync(zip, Buffer.from(await response.arrayBuffer()));
    files[name] = execFileSync("unzip", ["-p", zip, "*.csv"], {
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    });
  }
  return files;
}

/** Our places from the database, read-only. */
async function oursFromDb(): Promise<Ours> {
  const url = databaseUrl();
  if (!url) throw new Error("No database URL: pass --ours <dir> or set one.");
  const db = new Db(url, { readOnly: true });
  try {
    const streets = await db.query(
      `select l.teryt as simc, s.teryt as sym_ul, s.prefix, s.name
         from streets s join localities l on l.id = s.locality_id
        where s.teryt is not null`,
    );
    const localities = await db.query(
      `select g.teryt as terc, l.teryt as simc, l.name, p.teryt as parent
         from localities l join gminy g on g.id = l.gmina_id
         left join localities p on p.id = l.parent_id`,
    );
    return {
      streets: streets.rows.map((r) => ({
        simc: r.simc,
        symUl: r.sym_ul,
        cecha: r.prefix,
        name: r.name,
      })),
      localities: localities.rows.map((r) => ({
        terc: r.terc,
        simc: r.simc,
        name: r.name,
        parent: r.parent,
      })),
    };
  } finally {
    await db.close();
  }
}

/** Only our gminy's rows, as CSV text with the header (for the archive). */
function extract(text: string): string {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const [head] = lines;
  const prefixes = tercs.map(
    (t) => `${t.slice(0, 2)};${t.slice(2, 4)};${t.slice(4, 6)};${t.slice(6)};`,
  );
  return [head, ...lines.filter((l) => prefixes.some((p) => l.startsWith(p)))]
    .join("\r\n")
    .concat("\r\n");
}

async function main() {
  console.log(`TERYT check for gminy ${tercs.join(", ")}.`);
  let files: Files;
  try {
    files = args.teryt ? readDir(args.teryt) : await download();
  } catch (error) {
    const message = `TERYT could not be downloaded from ${PAGE}: ${(error as Error).message}`;
    if (!args.issue) throw new Error(message);
    issues.raise("teryt-fetch", "TERYT download failed", message);
    return;
  }
  if (args.issue) issues.resolve("teryt-fetch", "TERYT downloads again.");

  const ulic: UlicRow[] = parseUlic(extract(files.ULIC));
  const simc: SimcRow[] = parseSimc(extract(files.SIMC));
  const ours = args.ours
    ? (() => {
        const own = readDir(args.ours);
        return oursFromTeryt(parseUlic(own.ULIC), parseSimc(own.SIMC));
      })()
    : await oursFromDb();
  const changes = terytDiff(ours, ulic, simc, tercs);
  console.log(
    `TERYT: ${ulic.length} streets, ${simc.length} localities; ours: ${ours.streets.length} streets, ${ours.localities.length} localities.`,
  );
  if (changes.length === 0) {
    console.log("No changes: our places match TERYT.");
    if (args.issue) issues.resolve("teryt:", "Our places match TERYT again.");
    return;
  }
  const table = changesTable(changes);
  console.log(`${changes.length} change(s):\n${table}`);

  let archived = "";
  if (!args.teryt && args.issue) {
    for (const [name, text] of [
      ["ULIC", extract(files.ULIC)],
      ["SIMC", extract(files.SIMC)],
    ]) {
      const body = Buffer.from(text);
      const key = `sources/teryt/${today}/${name}_${tercs.join("_")}.csv`;
      archive(config, key, body, sha256(body));
      archived += `\n- \`${key}\``;
    }
  }
  if (!args.issue) process.exit(1);
  const key = `teryt:${sha256(table).slice(0, 8)}`;
  issues.raise(
    key,
    `TERYT: ${changes.length} change(s) to review`,
    [
      `TERYT (GUS ULIC/SIMC of ${today}) differs from our places in gminy ${tercs.join(", ")}. Nothing was changed: TERYT is the source of names, and waste zones map streets by name, so a person reviews each change.`,
      "",
      table,
      "",
      "D: new in TERYT. M: changed (name, CECHA, parent). U: gone from TERYT; a renamed street is a U plus a D (a new SYM_UL), so its page id changes: after the import, keep its old address with `npm run db:redirect` (docs/database.md).",
      archived ? `\nArchived:${archived}` : "",
      process.env.ACTIONS_RUN_URL
        ? `\nRun: ${process.env.ACTIONS_RUN_URL}`
        : "",
    ].join("\n"),
  );
  // A new set of changes replaces the issue of an older one.
  issues.resolve("teryt:", "Replaced by the issue for the current changes.");
}

await main();
