// npm run db:import -- --from <dir> [--teryt <dir>] [--approvals <yaml>]
//                       [--apply]
//
// Loads the ETL output (format: scripts/lib/import-data.ts; the original
// plan, docs/import-plan.md, is in git history). Without --apply it is
// a dry run: validate, check the sources, print the diff against the
// database, write nothing but the places' review file. With --apply, one
// transaction: rows are upserted, and zones and events missing from the
// input deleted. Places (streets, villages) are never deleted: one missing
// from the input is retired, and the places' changes are applied only as
// reviewed (scripts/lib/place-review.ts, docs/import.md "TERYT reload").
// Then the dataset snapshot the site reads is published
// (scripts/lib/dataset.ts), the site's cache is revalidated and one
// address page is checked.
//
// --teryt: the archived TERYT ULIC files (ULIC_*.csv, npm run sources:pull,
// e.g. ../.cache/sources/teryt/2026-10-18): every street's CECHA, NAZWA_1
// and NAZWA_2 are taken from them, so its name is TERYT's (CLAUDE.md).
// Without it the ETL's names are used, with a warning.
// Places: the dry run writes etl/review/teryt/places.yaml (--review <file>
// elsewhere, scripts/check-import.mjs) when places are
// added, retired or restored; --apply needs that file merged into main
// (origin/main, fetched; IMPORT_REVIEW_DIR instead in tests) for this exact
// plan. A new place without a waste zone blocks --apply and opens an issue;
// so does retiring over 10% of the places at once, unless
// --allow-mass-retire.
// Options: --offline (dry run only: skip downloading the sources),
// --allow-deletes (more than 10% of zones or events may go),
// --allow-mass-retire, --yes-production.
// Env: IMPORT_DATABASE_URL, DATABASE_URL_UNPOOLED or DATABASE_URL;
// BLOB_READ_WRITE_TOKEN (the dataset snapshot; --apply fails without it,
// the data then imported, the site on the old snapshot); optional
// GH_TOKEN (the unzoned-place issue), REVALIDATE_SECRET (site: etl/sources.yaml site.url, or SITE_URL), SITE_URL
// (also the smoke check), VERCEL_AUTOMATION_BYPASS_SECRET.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { and, getTableColumns, inArray, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import { parse as parseYaml } from "yaml";
import {
  events,
  gminy,
  localities,
  meta,
  streets,
  zoneMembers,
  zones,
} from "../db/schema.ts";
import { todayInWarsaw } from "../lib/dates.ts";
import { Issues } from "./import/core/issues.ts";
import { ROOT } from "./import/core/paths.ts";
import { publishDataset } from "./lib/dataset.ts";
import {
  type Approval,
  type Etl,
  fail,
  guardTarget,
  type Rows,
  transform,
  unsourced,
  validate,
  withTeryt,
} from "./lib/import-data.ts";
import { databaseUrl } from "./lib/local-db.ts";
import {
  applyBlockers,
  hasPlaceChanges,
  PLACE_REVIEW_FILE,
  type PlacePlan,
  type PlaceRow,
  placeReviewYaml,
  planPlaces,
  readPlaceReview,
  unzoned,
} from "./lib/place-review.ts";
import { revalidate } from "./lib/revalidate.ts";
import { parseUlic } from "./lib/teryt.ts";

/** The address that must keep working (printed QR codes link to it). */
const SMOKE_PLACE = "0972447-00470";
const DELETE_LIMIT = 0.1;
const EXAMPLES = 3;

const { values: args } = parseArgs({
  options: {
    from: { type: "string" },
    teryt: { type: "string" },
    approvals: { type: "string" },
    apply: { type: "boolean", default: false },
    offline: { type: "boolean", default: false },
    "allow-deletes": { type: "boolean", default: false },
    "allow-mass-retire": { type: "boolean", default: false },
    review: { type: "string" },
    "yes-production": { type: "boolean", default: false },
  },
});

function readEtl(dir: string): Etl {
  const read = (name: string) =>
    JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8"));
  return {
    gminy: read("gminy"),
    localities: read("localities"),
    streets: read("streets"),
    zones: read("zones"),
    events: read("events"),
    meta: read("meta"),
  };
}

function readApprovals(file: string | undefined): Map<string, Approval> {
  if (!file) return new Map();
  const doc = parseYaml(readFileSync(file, "utf8")) as {
    sectors?: Approval[];
  } | null;
  return new Map((doc?.sectors ?? []).map((a) => [a.zone_id, a]));
}

/**
 * The schedules the events cite (not the TERYT downloads, a form page whose
 * bytes change on every visit).
 */
function schedules(etl: Etl) {
  const cited = new Set(etl.events.map((e) => e.source.doc));
  return etl.meta.sources.filter((s) => cited.has(s.doc));
}

/** Downloads every schedule and compares it with the sha256 the ETL read. */
async function checkSources(etl: Etl, today: string) {
  const checkedAt = new Map<string, string>();
  const problems: string[] = [];
  for (const source of schedules(etl)) {
    try {
      const response = await fetch(source.url, {
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const sha = createHash("sha256")
        .update(Buffer.from(await response.arrayBuffer()))
        .digest("hex");
      if (sha !== source.sha256) throw new Error("file changed (sha256)");
      checkedAt.set(source.doc, today);
      console.log(`  ok       ${source.url}`);
    } catch (error) {
      problems.push(`${source.url}: ${(error as Error).message}`);
      console.log(`  FAILED   ${source.url}: ${(error as Error).message}`);
    }
  }
  return { checkedAt, problems };
}

// Key order does not matter in jsonb.
function same(a: unknown, b: unknown): boolean {
  const canon = (v: unknown): unknown =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v)
            .sort(([x], [y]) => x.localeCompare(y))
            .map(([k, x]) => [k, canon(x)]),
        )
      : v;
  return JSON.stringify(canon(a ?? null)) === JSON.stringify(canon(b ?? null));
}

type Row = Record<string, unknown> & { id: string };

function diffRows(next: Row[], current: Row[]) {
  const before = new Map(current.map((r) => [r.id, r]));
  const ids = new Set(next.map((r) => r.id));
  const added: Row[] = [];
  const changed: Array<{ row: Row; columns: string[] }> = [];
  for (const row of next) {
    const old = before.get(row.id);
    if (!old) {
      added.push(row);
      continue;
    }
    const columns = Object.keys(row).filter((k) => !same(row[k], old[k]));
    if (columns.length > 0) changed.push({ row, columns });
  }
  const removed = current.filter((r) => !ids.has(r.id));
  return { added, changed, removed, total: current.length };
}

type Diff = ReturnType<typeof diffRows>;

function printDiff(name: string, d: Diff, show: (r: Row) => string) {
  const columns = new Map<string, number>();
  for (const c of d.changed)
    for (const k of c.columns) columns.set(k, (columns.get(k) ?? 0) + 1);
  const which = [...columns].map(([k, n]) => `${k} ×${n}`).join(", ");
  console.log(
    `  ${name.padEnd(12)} +${d.added.length}  −${d.removed.length}  ~${d.changed.length}${which ? ` (${which})` : ""}  [now ${d.total}]`,
  );
  const examples = [
    ...d.added.slice(0, EXAMPLES).map((r) => `+ ${show(r)}`),
    ...d.removed.slice(0, EXAMPLES).map((r) => `− ${show(r)}`),
    ...d.changed.slice(0, EXAMPLES).map((c) => `~ ${show(c.row)}`),
  ];
  for (const line of examples) console.log(`      ${line}`);
}

const memberKey = (m: Record<string, unknown>) =>
  [m.localityId, m.streetId, m.houseFrom, m.houseTo, m.parity].join("|");

/** Rows for the columns the importer writes; snake_case for ON CONFLICT. */
function upsertSet(table: PgTable) {
  const snake = (key: string) =>
    key.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`);
  // A column named in the schema (streets.nazwa_1) keeps its name; the
  // others are their key in snake_case, as the casing option writes them.
  return Object.fromEntries(
    Object.entries(getTableColumns(table))
      .filter(([key]) => key !== "id")
      .map(([key, column]) => [
        key,
        sql.raw(`excluded."${column.keyAsName ? snake(key) : column.name}"`),
      ]),
  );
}

function chunks<T>(rows: T[], size = 500): T[][] {
  return Array.from({ length: Math.ceil(rows.length / size) }, (_, i) =>
    rows.slice(i * size, (i + 1) * size),
  );
}

function etlCommit(dir: string): string | null {
  try {
    return execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

async function smokeCheck(rows: Rows, today: string) {
  const site = process.env.SITE_URL;
  if (!site) {
    console.log("Smoke check skipped: SITE_URL is not set.");
    return;
  }
  const member = rows.zoneMembers.find((m) => m.streetId === SMOKE_PLACE);
  const expected =
    rows.events
      .filter((e) => e.zoneId === member?.zoneId && e.start >= today)
      .map((e) => e.start)
      .sort()[0] ?? null;
  const headers: Record<string, string> = {};
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET)
    headers["x-vercel-protection-bypass"] =
      process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  // The waste subpage: the address page's card shows the date as text.
  // Revalidated with "max", the first answer may be the stale page, which
  // starts the new one in the background: asked again, up to a minute.
  const url = new URL(`/adres/${SMOKE_PLACE}/smieci`, site);
  let response = await fetch(url, { headers });
  let shown: string | null = null;
  for (let i = 0; i < 12; i++) {
    const html = await response.text();
    shown = html.match(/<time dateTime="(\d{4}-\d{2}-\d{2})"/i)?.[1] ?? null;
    if (response.ok && shown === expected) break;
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    response = await fetch(url, { headers });
  }
  if (!response.ok || shown !== expected) {
    fail(
      `Smoke check FAILED for ${url.pathname}: HTTP ${response.status}, next pickup on the page ${shown ?? "none"}, in the data ${expected ?? "none"}. ` +
        "The data is imported; the page may still be re-rendering (Vercel ISR).",
    );
  }
  console.log(
    `Smoke check ok: ${url.pathname} shows the next pickup ${expected ?? "(none upcoming)"}.`,
  );
}

type Table = PgTable & { id: AnyPgColumn };

function printPlan(plan: PlacePlan) {
  console.log(
    `\nPlaces: +${plan.added.length} new, ${plan.retired.length} retired, ${plan.restored.length} restored  [now ${plan.current} current]`,
  );
  for (const p of plan.added)
    console.log(`  + ${p.id} ${p.name}  zone: ${p.zone ?? "NONE"}`);
  for (const p of plan.retired)
    console.log(
      `  − ${p.id} ${p.name}  → ${p.replacedBy ?? "gone"}${p.candidates.length ? `  (candidates: ${p.candidates.join(", ")})` : ""}`,
    );
  for (const p of plan.restored) console.log(`  ↺ ${p.id} ${p.name}`);
}

/**
 * The places' review file as merged into main: origin/main, fetched first,
 * so a file only on a branch or in the working tree never counts.
 * IMPORT_REVIEW_DIR (tests) holds merged files instead, as for the waste
 * reviews (scripts/import/core/review.ts).
 */
function mergedPlaceReview(): string | null {
  const dir = process.env.IMPORT_REVIEW_DIR;
  const name = PLACE_REVIEW_FILE.replace(/^etl\/review\//, "");
  if (dir) {
    try {
      return readFileSync(join(dir, name), "utf8");
    } catch {
      return null;
    }
  }
  const git = (args: string[]) =>
    execFileSync("git", ["-C", ROOT, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  git(["fetch", "--quiet", "origin", "main"]);
  try {
    return git(["show", `origin/main:${PLACE_REVIEW_FILE}`]);
  } catch {
    return null;
  }
}

const placeRows = (rows: Array<Record<string, unknown>>) =>
  rows as unknown as PlaceRow[];

async function main() {
  if (!args.from) fail("Usage: npm run db:import -- --from <dir> [--apply]");
  if (args.apply && args.offline)
    fail("--offline is for dry runs only: --apply needs checked sources.");
  const url = databaseUrl();
  if (!url) fail("DATABASE_URL is not set.");

  guardTarget(url, args);

  let etl = readEtl(args.from);
  const errors = validate(etl);
  if (args.teryt) {
    const dir = args.teryt;
    const ulic = readdirSync(dir)
      .filter((file) => /^ULIC_.*\.csv$/i.test(file))
      .flatMap((file) => parseUlic(readFileSync(join(dir, file), "utf8")));
    if (ulic.length === 0) fail(`No ULIC_*.csv in ${dir}.`);
    const named = withTeryt(etl, ulic);
    etl = named.etl;
    errors.push(...named.errors);
    for (const w of named.warnings) console.log(`TERYT: ${w}`);
  } else {
    console.log(
      "TERYT: no --teryt, street names are the ETL's (not checked against ULIC).",
    );
  }
  if (errors.length > 0) {
    fail(
      `Invalid dataset (${errors.length}):\n${errors.slice(0, 20).join("\n")}`,
    );
  }
  console.log(
    `Dataset ${etl.meta.year}: ${etl.events.length} events, ${etl.zones.length} zones, ${etl.streets.length} streets, ${etl.localities.length} localities. Valid.`,
  );
  console.log(
    `Flags: ${etl.meta.flags?.join(", ") || "none"}${etl.meta.provisional ? " (provisional)" : ""}`,
  );

  const today = todayInWarsaw();
  let checkedAt = new Map<string, string>();
  if (args.offline) {
    console.log("Sources: not checked (--offline); diff assumes today.");
    for (const s of schedules(etl)) checkedAt.set(s.doc, today);
  } else {
    console.log(`Schedules (${schedules(etl).length}):`);
    const result = await checkSources(etl, today);
    checkedAt = result.checkedAt;
    if (result.problems.length > 0) {
      if (args.apply)
        fail("Source check failed; nothing written. Re-run the ETL first.");
      console.log("  --apply would abort here.");
      for (const s of schedules(etl))
        if (!checkedAt.has(s.doc)) checkedAt.set(s.doc, today);
    }
  }

  const approvals = readApprovals(args.approvals);
  const { rows, zoneHashes, warnings } = transform(etl, checkedAt, approvals);
  for (const w of warnings) console.log(`Approval: ${w}`);
  // No source, no display: an event without one is never written.
  const noSource = unsourced(rows.events);
  if (noSource.length > 0) {
    fail(
      `Events without a source (${noSource.length}), nothing written:\n${noSource.slice(0, 20).join("\n")}`,
    );
  }

  const db = drizzle(url, { casing: "snake_case" });
  const [curGminy, curLocalities, curStreets, curZones, curMembers, curEvents] =
    await Promise.all([
      db.select().from(gminy),
      db.select().from(localities),
      db.select().from(streets),
      db.select().from(zones),
      db.select().from(zoneMembers),
      db.select().from(events),
    ]);

  const diffs = {
    gminy: diffRows(rows.gminy as Row[], curGminy),
    localities: diffRows(rows.localities as Row[], curLocalities),
    streets: diffRows(rows.streets as Row[], curStreets),
    zones: diffRows(rows.zones as Row[], curZones),
    events: diffRows(rows.events as Row[], curEvents),
  };
  console.log("\nDiff against the database:");
  printDiff("gminy", diffs.gminy, (r) => `${r.id} ${r.name}`);
  printDiff("localities", diffs.localities, (r) => `${r.id} ${r.name}`);
  printDiff("streets", diffs.streets, (r) => `${r.id} ${r.prefix} ${r.name}`);
  printDiff("zones", diffs.zones, (r) => `${r.id} ${r.name}`);
  printDiff(
    "events",
    diffs.events,
    (r) => `${r.zoneId} ${r.start} ${r.subtype}`,
  );

  const zoneIds = [
    ...new Set([...rows.zones.map((z) => z.id), ...curZones.map((z) => z.id)]),
  ].sort();
  console.log(
    "\nPer zone (events +added −removed ~changed, upcoming; members old → new):",
  );
  for (const zoneId of zoneIds) {
    const inZone = (r: Row) => r.zoneId === zoneId;
    const oldMembers = curMembers.filter((m) => m.zoneId === zoneId);
    const newMembers = rows.zoneMembers.filter((m) => m.zoneId === zoneId);
    const membersSame = same(
      oldMembers.map(memberKey).sort(),
      newMembers.map(memberKey).sort(),
    );
    const upcoming = rows.events.filter(
      (e) => e.zoneId === zoneId && e.start >= today,
    ).length;
    console.log(
      `  ${zoneId.padEnd(18)} +${diffs.events.added.filter(inZone).length}  −${diffs.events.removed.filter(inZone).length}  ~${diffs.events.changed.filter((c) => inZone(c.row)).length}  upcoming ${upcoming}  members ${oldMembers.length} → ${newMembers.length}${membersSame ? "" : " (changed)"}`,
    );
  }
  console.log(
    "\nevents_sha256 per zone (paste into approvals.yaml when a sector is approved):",
  );
  for (const [zoneId, hash] of zoneHashes)
    console.log(`  ${zoneId.padEnd(18)} ${hash}`);

  // Places are never deleted: retired, as reviewed.
  const plan = planPlaces(
    {
      streets: placeRows(curStreets),
      localities: placeRows(curLocalities),
    },
    {
      streets: placeRows(rows.streets),
      localities: placeRows(rows.localities),
    },
    // The waste zones' members, as the site picks a place's zone.
    rows.zoneMembers
      .filter((m) =>
        rows.zones.some((z) => z.id === m.zoneId && z.type === "waste"),
      )
      .map((m) => ({ ...m, streetId: m.streetId ?? null })),
  );
  printPlan(plan);

  if (!args.apply) {
    if (hasPlaceChanges(plan)) {
      const file = args.review ?? join(ROOT, PLACE_REVIEW_FILE);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, placeReviewYaml(plan, today));
      console.log(
        `\nPlaces' review written: ${file}. Commit it on a branch and open a pull request; merging it approves this plan, then run again with --apply.`,
      );
    }
    for (const blocker of applyBlockers(plan, {
      allowMassRetire: args["allow-mass-retire"],
    }))
      console.log(`--apply would stop: ${blocker}`);
    console.log(
      "\nDry run: nothing written to the database. Add --apply to import.",
    );
    await db.$client.end();
    return;
  }

  // Zones and events may go, within the limit; places never do.
  if (!args["allow-deletes"]) {
    for (const name of ["gminy", "zones", "events"] as const) {
      const d = diffs[name];
      if (d.total > 0 && d.removed.length / d.total > DELETE_LIMIT)
        fail(
          `${name}: would delete ${d.removed.length} of ${d.total} rows (over ${DELETE_LIMIT * 100}%). Check the diff, then add --allow-deletes.`,
        );
    }
  }
  const blockers = applyBlockers(plan, {
    allowMassRetire: args["allow-mass-retire"],
  });
  if (unzoned(plan).length > 0)
    new Issues().raise(
      `teryt-unzoned:${plan.sha256.slice(0, 8)}`,
      "TERYT: nowe miejsca bez strefy odbioru",
      [
        "The TERYT reload (`npm run db:import -- --teryt`) found new places no waste zone covers, and applied nothing: no place goes live without its schedule.",
        "",
        ...unzoned(plan).map((p) => `- \`${p.id}\` ${p.name}`),
        "",
        "Map them to their sector in the ETL's zones, run the dry run again and review the new etl/review/teryt/places.yaml. RUNBOOK: docs/import.md, „TERYT reload”.",
      ].join("\n"),
    );
  if (blockers.length > 0)
    fail(`Places: nothing written.\n- ${blockers.join("\n- ")}`);
  let replacedBy = new Map<string, string | null>();
  if (hasPlaceChanges(plan)) {
    const { review, errors } = readPlaceReview(mergedPlaceReview(), plan, {
      streets: placeRows(rows.streets),
      localities: placeRows(rows.localities),
    });
    if (!review) fail(`Places: nothing written.\n- ${errors.join("\n- ")}`);
    replacedBy = review.replacedBy;
  }

  const dataset = {
    year: etl.meta.year,
    provisional: etl.meta.provisional ?? false,
    flags: etl.meta.flags ?? [],
    sources: etl.meta.sources.map(({ doc, url, sha256 }) => ({
      doc,
      url,
      sha256,
      checkedAt: checkedAt.get(doc),
    })),
    importedAt: new Date().toISOString(),
    etlCommit: etlCommit(args.from),
  };

  await db.transaction(async (tx) => {
    const insert = async (table: Table, list: object[], upsert: boolean) => {
      for (const chunk of chunks(list)) {
        const query = tx.insert(table).values(chunk);
        await (upsert
          ? query.onConflictDoUpdate({
              target: table.id,
              set: upsertSet(table),
            })
          : query);
      }
    };
    const remove = async (table: Table, removed: Row[]) => {
      for (const chunk of chunks(removed.map((r) => r.id)))
        await tx.delete(table).where(inArray(table.id, chunk));
    };

    const changed = (d: Diff) => [...d.added, ...d.changed.map((c) => c.row)];
    await insert(gminy, changed(diffs.gminy), true);
    await insert(localities, changed(diffs.localities), true);
    await insert(streets, changed(diffs.streets), true);
    await insert(zones, changed(diffs.zones), true);
    // Members have no natural key: replace each zone's list.
    for (const chunk of chunks(rows.zones.map((z) => z.id)))
      await tx.delete(zoneMembers).where(inArray(zoneMembers.zoneId, chunk));
    await insert(zoneMembers as unknown as Table, rows.zoneMembers, false);
    await insert(events, changed(diffs.events), true);
    await remove(events, diffs.events.removed);
    // Deleting a zone deletes its members and events (on delete cascade).
    await remove(zones, diffs.zones.removed);
    // Places are retired, never deleted: their addresses keep answering.
    const retiredAt = new Date().toISOString();
    for (const place of plan.retired) {
      const table = curStreets.some((s) => s.id === place.id)
        ? streets
        : localities;
      await tx
        .update(table)
        .set({ retiredAt, replacedBy: replacedBy.get(place.id) ?? null })
        .where(and(inArray(table.id, [place.id]), isNull(table.retiredAt)));
    }
    await remove(gminy, diffs.gminy.removed);
    await tx.delete(meta).where(inArray(meta.key, ["dataset"]));
    await tx.insert(meta).values({ key: "dataset", value: dataset });
  });
  await db.$client.end();
  console.log(
    `\nImported: ${rows.events.length} events, ${rows.zones.length} zones, ${rows.streets.length} streets, ${rows.localities.length} localities.`,
  );

  let action: Awaited<ReturnType<typeof revalidate>> | null = null;
  try {
    const published = await publishDataset(url);
    if (published?.changed) action = await revalidate();
  } catch (error) {
    fail(
      `${(error as Error).message} The data is imported; the site shows the old snapshot until \`npm run dataset:publish\` succeeds.`,
    );
  }
  if (action === "deploy" || action === "deploy-pending")
    console.log(
      "Smoke check skipped: the place set changed, a new deployment builds this snapshot.",
    );
  else await smokeCheck(rows, today);
}

await main();
