// npm run db:import -- --from <dir> [--approvals <yaml>] [--apply]
//
// Loads the ETL output (docs/import-plan.md section 3). Without --apply it is
// a dry run: validate, check the sources, print the diff against the
// database, write nothing. With --apply, one transaction: rows are upserted
// and rows missing from the input deleted. Then the site's cache is
// revalidated and one address page is checked.
//
// Options: --offline (dry run only: skip downloading the sources),
// --allow-deletes (more than 10% of a table may go), --yes-production.
// Env: DATABASE_URL_UNPOOLED or DATABASE_URL; optional SITE_URL,
// REVALIDATE_SECRET, SITE_BASIC_AUTH, VERCEL_AUTOMATION_BYPASS_SECRET.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { getTableColumns, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import { parse as parseYaml } from "yaml";
import { todayInWarsaw } from "../lib/dates.ts";
import {
  events,
  gminy,
  localities,
  meta,
  streets,
  zoneMembers,
  zones,
} from "../lib/db/schema.ts";
import {
  type Approval,
  describeTarget,
  type Etl,
  type Rows,
  transform,
  validate,
} from "./lib/import-data.ts";

/** The address that must keep working (printed QR codes link to it). */
const SMOKE_PLACE = "0972447-00470";
const DELETE_LIMIT = 0.1;
const EXAMPLES = 3;

const { values: args } = parseArgs({
  options: {
    from: { type: "string" },
    approvals: { type: "string" },
    apply: { type: "boolean", default: false },
    offline: { type: "boolean", default: false },
    "allow-deletes": { type: "boolean", default: false },
    "yes-production": { type: "boolean", default: false },
  },
});

function fail(message: string): never {
  console.error(`\n${message}`);
  process.exit(1);
}

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
  return Object.fromEntries(
    Object.keys(getTableColumns(table))
      .filter((key) => key !== "id")
      .map((key) => [key, sql.raw(`excluded."${snake(key)}"`)]),
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
  if (process.env.SITE_BASIC_AUTH)
    headers.Authorization = `Basic ${Buffer.from(process.env.SITE_BASIC_AUTH).toString("base64")}`;
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET)
    headers["x-vercel-protection-bypass"] =
      process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const url = new URL(`/adres/${SMOKE_PLACE}`, site);
  const response = await fetch(url, { headers });
  const html = await response.text();
  const shown =
    html.match(/<time dateTime="(\d{4}-\d{2}-\d{2})"/i)?.[1] ?? null;
  if (!response.ok || shown !== expected) {
    fail(
      `Smoke check FAILED for ${url.pathname}: HTTP ${response.status}, next pickup on the page ${shown ?? "none"}, in the data ${expected ?? "none"}. ` +
        "The data is imported; a cached copy may still be served (CDN up to s-maxage).",
    );
  }
  console.log(
    `Smoke check ok: ${url.pathname} shows the next pickup ${expected ?? "(none upcoming)"}.`,
  );
}

async function revalidate() {
  const site = process.env.SITE_URL;
  const secret = process.env.REVALIDATE_SECRET;
  if (!site || !secret) {
    console.log(
      "Revalidate skipped: SITE_URL or REVALIDATE_SECRET is not set. Cached pages refresh within an hour.",
    );
    return;
  }
  const headers: Record<string, string> = { Authorization: `Bearer ${secret}` };
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET)
    headers["x-vercel-protection-bypass"] =
      process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const response = await fetch(new URL("/api/revalidate", site), {
    method: "POST",
    headers,
  });
  if (!response.ok)
    fail(`Revalidate FAILED: HTTP ${response.status}. The data is imported.`);
  console.log(`Revalidate ok: ${await response.text()}`);
}

type Table = PgTable & { id: AnyPgColumn };

async function main() {
  if (!args.from) fail("Usage: npm run db:import -- --from <dir> [--apply]");
  if (args.apply && args.offline)
    fail("--offline is for dry runs only: --apply needs checked sources.");
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) fail("DATABASE_URL is not set.");

  const target = describeTarget(url, process.env);
  console.log(
    `Target: ${target.label}${target.production ? ", PRODUCTION" : ""}. Mode: ${args.apply ? "APPLY" : "dry run"}.`,
  );
  if (args.apply && target.production && !args["yes-production"])
    fail("This is the production database. Add --yes-production to write.");

  const etl = readEtl(args.from);
  const errors = validate(etl);
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

  if (!args.apply) {
    console.log("\nDry run: nothing written. Add --apply to import.");
    await db.$client.end();
    return;
  }

  if (!args["allow-deletes"]) {
    for (const [name, d] of Object.entries(diffs)) {
      if (d.total > 0 && d.removed.length / d.total > DELETE_LIMIT)
        fail(
          `${name}: would delete ${d.removed.length} of ${d.total} rows (over ${DELETE_LIMIT * 100}%). Check the diff, then add --allow-deletes.`,
        );
    }
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
    await remove(streets, diffs.streets.removed);
    // Village parts before their villages.
    await remove(
      localities,
      [...diffs.localities.removed].sort(
        (a, b) => Number(Boolean(b.parentId)) - Number(Boolean(a.parentId)),
      ),
    );
    await remove(gminy, diffs.gminy.removed);
    await tx.delete(meta).where(inArray(meta.key, ["dataset"]));
    await tx.insert(meta).values({ key: "dataset", value: dataset });
  });
  await db.$client.end();
  console.log(
    `\nImported: ${rows.events.length} events, ${rows.zones.length} zones, ${rows.streets.length} streets, ${rows.localities.length} localities.`,
  );

  await revalidate();
  await smokeCheck(rows, today);
}

await main();
