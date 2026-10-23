// npm run import:run -- [--dry-run] [--read-only] [--force-extract]
//                         [--extract-only]
//
// The unattended import (docs/import.md), run by .github/workflows/import.yml.
// Everything it does is configured in etl/sources.yaml; what a source's
// files mean is its domain's business (../domains.ts). For every source:
// detect the published files (WordPress REST API; the watched pages if the
// API is down), notice new links on the
// watched pages, download only what is new, archive it in S3, extract,
// validate, and apply the difference in one transaction tagged with a batch
// id (undo: npm run import:revert -- <batch>). Anything doubtful is not
// applied: an issue says why, one per problem, closed by the next clean run;
// a file a person must look at gets a review PR instead (./review.ts).
// One import_runs row per source per run. Then the dead-man switch, for each
// domain that opts in: an issue while any of its zones' dates run out within
// domains.<domain>.coverageMinDays.
//
// --dry-run: no data written (the import_runs row still is). --read-only:
// nothing written at all. --force-extract: extract known files too (proves
// the extraction reproduces the database). --extract-only: no database at
// all: detect, download, extract and validate, print, exit 1 on any problem
// (tests the vision passes).
//
// Env: IMPORT_DATABASE_URL (or DATABASE_URL_UNPOOLED / DATABASE_URL);
// CURSOR_API_KEY (vision passes, Actions only); REVALIDATE_SECRET (site:
// site.url, or SITE_URL); GH_TOKEN
// (issues, review PRs); AWS credentials (archive); ACTIONS_RUN_URL. Tests:
// IMPORT_CONFIG (another config file), IMPORT_NOW (the clock), ARCHIVE_DIR
// (instead of S3), ISSUES_FILE and REVIEWS_FILE (instead of GitHub),
// IMPORT_REVIEW_DIR (instead of etl/review), CURSOR_AGENT_MOCK (pass outputs).
import { randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { todayInWarsaw } from "../../../lib/dates.ts";
import { databaseUrl } from "../../lib/local-db.ts";
import { revalidate } from "../../lib/revalidate.ts";
import { DOMAINS } from "../domains.ts";
import { archive } from "./archive.ts";
import { archiveKey, loadConfig, type Source } from "./config.ts";
import { Db } from "./db.ts";
import type { Detection, Extracted, Found } from "./domain.ts";
import { coverageGaps, diffEvents } from "./events.ts";
import { scopeEvents, writeChange } from "./events-db.ts";
import { sha256 } from "./hash.ts";
import { http } from "./http.ts";
import { Issues } from "./issues.ts";
import { Reviews } from "./review.ts";
import { linksHash, readWatched } from "./watch.ts";

const { values: args } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    "read-only": { type: "boolean", default: false },
    "force-extract": { type: "boolean", default: false },
    "extract-only": { type: "boolean", default: false },
  },
});
const extractOnly = args["extract-only"];
const readOnly = args["read-only"] || extractOnly;
const dryRun = args["dry-run"] || readOnly;

const config = loadConfig(process.env.IMPORT_CONFIG || undefined);
const net = http(config.import.retries, config.site.url);
const issues = new Issues();
const reviews = new Reviews(net);
// The clock (IMPORT_NOW in tests): today and every timestamp.
const clock = () =>
  process.env.IMPORT_NOW ? new Date(process.env.IMPORT_NOW) : new Date();
const today = todayInWarsaw(clock());
const runUrl = process.env.ACTIONS_RUN_URL ?? "";
const archivedKeys = new Map(
  config.archived.map((a) => [a.sha256, archiveKey(a)]),
);
const shortHash = (text: string) => sha256(text).slice(0, 8);

/** Detect via the source's detector; the watched pages if its API is down. */
async function detect(source: Source): Promise<{
  detection: Detection;
  pages: Awaited<ReturnType<typeof readWatched>> | null;
}> {
  const domain = DOMAINS[source.domain];
  try {
    return {
      detection: await domain.detectors[source.detect.type](source, net),
      pages: null,
    };
  } catch (apiError) {
    console.log(
      `${source.id}: WordPress API unavailable (${(apiError as Error).message}); falling back to the watched pages.`,
    );
    try {
      const pages = await readWatched(source, net);
      return { detection: domain.detectFromPages(source, pages), pages };
    } catch (pageError) {
      throw new Error(
        `the WordPress API and the watched pages both failed: ${(apiError as Error).message}; ${(pageError as Error).message}`,
      );
    }
  }
}

// ------------------------------------------------------------------ extract-only

if (extractOnly) {
  let problems = 0;
  for (const source of config.sources) {
    // An unreachable site or file is a problem, not the end of the run.
    let detection: Detection;
    try {
      ({ detection } = await detect(source));
    } catch (error) {
      problems++;
      console.log(`\n${source.id}: ${(error as Error).message}`);
      continue;
    }
    console.log(
      `\n${source.id}: ${detection.files.length} files (via ${detection.via})`,
    );
    for (const file of detection.files) {
      try {
        const body = Buffer.from(await (await net.get(file.url)).arrayBuffer());
        const domain = DOMAINS[source.domain];
        const out = await domain.extractors[source.extract.type]({
          source,
          config,
          file,
          body,
          doc: file.name,
          digest: sha256(body),
        });
        const found = [
          ...out.problems,
          ...(await domain.check({
            db: null,
            config,
            source,
            file,
            digest: sha256(body),
            out,
            zoneName: "",
            issues,
            reviews,
            dryRun,
            runUrl,
          })),
        ];
        problems += found.length;
        console.log(
          `  ${file.name}: ${out.events.length} events, ${out.listed.length} listed${found.length ? `\n  - ${found.join("\n  - ")}` : ", ok"}`,
        );
      } catch (error) {
        problems++;
        console.log(`  ${file.name}: ${(error as Error).message}`);
      }
    }
  }
  console.log(
    problems
      ? `\n${problems} problem(s).`
      : "\nAll files extracted and agreed.",
  );
  process.exit(problems ? 1 : 0);
}

// ------------------------------------------------------------------ database

const url = databaseUrl();
if (!url) throw new Error("IMPORT_DATABASE_URL is not set.");
// Opened on demand and closed during extraction (./db.ts).
const db = new Db(url, { readOnly });
const tracked = Boolean(
  (await db.query("select to_regclass('import_runs') as t")).rows[0].t,
);

type Outcome = {
  status: "no_change" | "applied" | "needs_review" | "failed";
  via: "api" | "page" | null;
  filesSeen: number;
  filesChanged: number;
  added: number;
  removed: number;
  changed: number;
  batchId: string | null;
  error: string | null;
};

async function importSource(source: Source): Promise<Outcome> {
  const domain = DOMAINS[source.domain];
  const { detection, pages: fallbackPages } = await detect(source);
  const problems = detection.unrecognised.map(
    (u) => `a new file the adapter cannot read: ${u}`,
  );
  const refresh =
    (await domain.afterDetect?.({ db, source, detection, issues, dryRun })) ??
    false;

  // Known files and links.
  const settledMedia = new Map<string, string>();
  const knownBySha = new Map<
    string,
    { doc: string; s3Key: string | null; settled: boolean }
  >();
  const knownUrls = new Set(
    config.archived.flatMap((a) => (a.url ? [a.url] : [])),
  );
  if (tracked) {
    for (const r of (
      await db.query("select * from source_files where source = $1", [
        source.id,
      ])
    ).rows) {
      if (r.settled_at && r.media_id !== null)
        settledMedia.set(`${r.media_id}|${r.modified_gmt}`, r.sha256);
      knownBySha.set(r.sha256, {
        doc: r.doc,
        s3Key: r.s3_key,
        settled: Boolean(r.settled_at),
      });
      knownUrls.add(r.url);
    }
  }
  // Files imported before the import was automated are known by their events.
  const imported = new Map<string, { doc: string; checkedAt: string }>();
  for (const r of (
    await db.query(
      "select distinct source_sha256, source_doc, source_url, to_char(checked_at, 'YYYY-MM-DD') as checked_at from events where source_sha256 is not null",
    )
  ).rows) {
    imported.set(r.source_sha256, {
      doc: r.source_doc,
      checkedAt: r.checked_at,
    });
    knownUrls.add(r.source_url);
  }

  // Watched pages: a schedule link that appeared and nothing picked up.
  let pages = fallbackPages;
  try {
    pages ??= await readWatched(source, net);
  } catch (error) {
    console.log(
      `${source.id}: a watched page is unreachable (${(error as Error).message}); checked again next run.`,
    );
  }
  const handled = new Set([
    ...knownUrls,
    ...detection.files.map((f) => f.url),
    ...(detection.page ? [detection.page] : []),
    source.page,
  ]);
  const now = clock().toISOString();
  for (const page of tracked ? (pages ?? []) : []) {
    const hash = linksHash(page.links);
    const stored = (
      await db.query("select hash, links from source_pages where url = $1", [
        page.url,
      ])
    ).rows[0];
    const added = stored
      ? page.links.filter((l) => !(stored.links as string[]).includes(l))
      : [];
    const unknown = added.filter(
      (l) => !handled.has(l) && !page.ignore.includes(l),
    );
    if (unknown.length)
      problems.push(
        `${page.url} lists new link(s) the import did not pick up: ${unknown.join(", ")}. If one is a new schedule, update the source in etl/sources.yaml; if not, add it to that watch entry's \`ignore\`.`,
      );
    if (dryRun) continue;
    // A page with an unexplained link keeps its old hash, so it is reported
    // again until the config handles it.
    if (!stored)
      await db.query(
        "insert into source_pages (url, source, hash, links, checked_at, changed_at) values ($1, $2, $3, $4, $5, $5)",
        [page.url, source.id, hash, JSON.stringify(page.links), now],
      );
    else if (stored.hash !== hash && unknown.length === 0)
      await db.query(
        "update source_pages set hash = $2, links = $3, checked_at = $4, changed_at = $4 where url = $1",
        [page.url, hash, JSON.stringify(page.links), now],
      );
    else
      await db.query("update source_pages set checked_at = $2 where url = $1", [
        page.url,
        now,
      ]);
  }

  // A file is settled once a run applied it or found nothing to change; until
  // then it is extracted again every run, so it applies as soon as its
  // problem is fixed (e.g. an approval merged).
  const settle = async (file: Found, digest: string) => {
    if (tracked && !dryRun)
      await db.query(
        "update source_files set settled_at = $1, media_id = coalesce($2, media_id), modified_gmt = coalesce($3, modified_gmt) where sha256 = $4",
        [now, file.mediaId, file.modified, digest],
      );
  };
  const work: Array<{
    file: Found;
    body: Buffer;
    digest: string;
    doc: string;
    checkedAt: string;
    isNew: boolean;
  }> = [];
  for (const file of detection.files) {
    const seen =
      file.mediaId !== null
        ? settledMedia.get(`${file.mediaId}|${file.modified}`)
        : undefined;
    if (seen && !args["force-extract"]) {
      if (!dryRun)
        await db.query(
          "update source_files set last_seen_at = $1 where sha256 = $2",
          [now, seen],
        );
      continue;
    }
    const body = Buffer.from(await (await net.get(file.url)).arrayBuffer());
    const digest = sha256(body);
    const known = knownBySha.get(digest);
    const before = imported.get(digest);
    const settled = Boolean(known?.settled || before);
    const doc =
      known?.doc ??
      before?.doc ??
      `sources/${source.origin}/${today}/${file.name}`;
    let s3Key = known?.s3Key ?? archivedKeys.get(digest) ?? null;
    if (!s3Key && !dryRun) {
      archive(config, doc, body, digest);
      s3Key = doc;
    }
    if (tracked && !dryRun)
      await db.query(
        `insert into source_files (sha256, source, url, media_id, modified_gmt, doc, s3_key, first_seen_at, last_seen_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $8)
         on conflict (sha256) do update set url = $3, s3_key = $7, last_seen_at = $8`,
        [
          digest,
          source.id,
          file.url,
          file.mediaId,
          file.modified,
          doc,
          s3Key,
          now,
        ],
      );
    if (settled && !args["force-extract"]) {
      await settle(file, digest);
      continue;
    }
    work.push({
      file,
      body,
      digest,
      doc,
      checkedAt: before?.checkedAt ?? today,
      isNew: !settled,
    });
  }
  const filesChanged = work.filter((w) => w.isNew).length;

  // Extract, validate and diff each file in its scope.
  const plans: Array<{ zoneId: string; diff: ReturnType<typeof diffEvents> }> =
    [];
  const held: string[] = [];
  for (const { file, body, digest, doc, checkedAt } of work) {
    // No connection waits idle through the vision passes (minutes).
    await db.close();
    let out: Extracted;
    try {
      out = await domain.extractors[source.extract.type]({
        source,
        config,
        file,
        body,
        doc,
        digest,
      });
    } catch (error) {
      problems.push(
        `${file.name}: extraction failed: ${(error as Error).message}`,
      );
      continue;
    }
    const zone = (
      await db.query("select name from zones where id = $1", [out.zoneId])
    ).rows[0];
    if (!zone) {
      problems.push(`${file.name}: zone ${out.zoneId} does not exist`);
      continue;
    }
    problems.push(...out.problems.map((p) => `${file.name}: ${p}`));
    problems.push(
      ...(await domain.check({
        db,
        config,
        source,
        file,
        digest,
        out,
        zoneName: zone.name,
        issues,
        reviews,
        dryRun,
        runUrl,
      })),
    );
    // Waiting for its review PR (or rejected there): not applied.
    const hold = reviews.held(digest);
    if (hold) {
      console.log(`${file.name}: not applied, ${hold.note}`);
      if (hold.blocks) held.push(`${file.name}: ${hold.note}`);
      continue;
    }
    const next = domain.rows({ out, zoneName: zone.name, doc, checkedAt });
    plans.push({
      zoneId: out.zoneId,
      diff: diffEvents(await scopeEvents(db, out.zoneId, out.scope), next),
    });
  }

  const added = plans.reduce((n, p) => n + p.diff.added.length, 0);
  const removed = plans.reduce((n, p) => n + p.diff.removed.length, 0);
  const changed = plans.reduce((n, p) => n + p.diff.changed.length, 0);
  const summary = plans
    .filter(
      (p) =>
        p.diff.added.length + p.diff.removed.length + p.diff.changed.length > 0,
    )
    .map((p) =>
      [
        `### ${p.zoneId}: +${p.diff.added.length} −${p.diff.removed.length} ~${p.diff.changed.length}`,
        ...p.diff.added
          .slice(0, 20)
          .map((r) => `- dodane: ${r.start} ${r.subtype}`),
        ...p.diff.removed
          .slice(0, 20)
          .map((r) => `- usunięte: ${r.start} ${r.subtype}`),
        ...p.diff.changed
          .slice(0, 10)
          .map(
            (c) =>
              `- zmienione: ${c.after.start} ${c.after.subtype} (${c.columns.join(", ")})`,
          ),
      ].join("\n"),
    )
    .join("\n\n");
  console.log(
    `\n${source.id}: ${detection.files.length} files via ${detection.via}, ${filesChanged} new; events +${added} −${removed} ~${changed}`,
  );
  if (summary) console.log(summary);
  const base = {
    via: detection.via,
    filesSeen: detection.files.length,
    filesChanged,
    added,
    removed,
    changed,
  };

  if (problems.length + held.length > 0) {
    console.log(`\nNot applied:\n- ${[...problems, ...held].join("\n- ")}`);
    // A held file's review PR is its notice; other problems open an issue.
    if (!dryRun && problems.length > 0)
      issues.raise(
        `${source.id}:review:${shortHash(problems.join("\n"))}`,
        `${source.name}: ${filesChanged ? "zmiana wymaga sprawdzenia" : "problem z odczytem"}`,
        [
          `The unattended import found something in **${source.name}** it cannot apply on its own, and applied **nothing** from it.`,
          "",
          "**Why:**",
          ...problems.map((p) => `- ${p}`),
          summary ? `\n**What would change:**\n\n${summary}` : "",
          "",
          `Fix the cause (${domain.fixHint}); the next run applies it and closes this issue. RUNBOOK: docs/import.md.`,
          runUrl ? `\nRun: ${runUrl}` : "",
        ].join("\n"),
      );
    if (refresh && !dryRun) await revalidate(config.site.url);
    return {
      status: "needs_review",
      ...base,
      batchId: null,
      error: [...problems, ...held].join("\n"),
    };
  }
  if (added + removed + changed === 0) {
    for (const w of work) await settle(w.file, w.digest);
    if (refresh && !dryRun) await revalidate(config.site.url);
    return { status: "no_change", ...base, batchId: null, error: null };
  }
  if (dryRun) {
    console.log("\nDry run: nothing applied.");
    return { status: "applied", ...base, batchId: null, error: null };
  }
  const batchId = `${today}-${source.id}-${randomUUID().slice(0, 8)}`;
  await db.query("begin");
  try {
    for (const { diff } of plans) {
      for (const row of diff.added)
        await writeChange(db, batchId, "insert", null, row);
      for (const { before, after } of diff.changed)
        await writeChange(db, batchId, "update", before, after);
      for (const row of diff.removed)
        await writeChange(db, batchId, "delete", row, null);
    }
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
  for (const w of work) await settle(w.file, w.digest);
  console.log(
    `\nApplied as batch ${batchId} (undo: npm run import:revert -- ${batchId}).`,
  );
  await revalidate(config.site.url);
  return { status: "applied", ...base, batchId, error: null };
}

// ------------------------------------------------------------------ main

let failed = false;
// A failure issue was opened, so the workflow need not open its own.
let issued = false;
for (const source of config.sources) {
  const startedAt = clock().toISOString();
  let outcome: Outcome;
  try {
    outcome = await importSource(source);
  } catch (error) {
    failed = true;
    const message = (error as Error).stack ?? String(error);
    console.error(`\n${source.id} failed: ${message}`);
    outcome = {
      status: "failed",
      via: null,
      filesSeen: 0,
      filesChanged: 0,
      added: 0,
      removed: 0,
      changed: 0,
      batchId: null,
      error: message.slice(0, 4000),
    };
    if (!dryRun) {
      issued = true;
      issues.raise(
        `${source.id}:failed:${shortHash((error as Error).message ?? "")}`,
        `${source.name}: błąd importu`,
        [
          `The unattended import of **${source.name}** failed; nothing was applied. It is retried by the next run.`,
          "",
          "```",
          message.slice(0, 3000),
          "```",
          runUrl ? `Run: ${runUrl}` : "",
        ].join("\n"),
      );
    }
  }
  // A clean (or merely blocked) run closes this source's older issues.
  if (!dryRun && outcome.status !== "failed")
    issues.resolve(
      `${source.id}:`,
      `Resolved: the import of ${source.name} ran ${outcome.status === "needs_review" ? "again and reports the current problem in another issue" : "clean"} on ${today}.${runUrl ? ` ${runUrl}` : ""}`,
    );
  if (tracked && !readOnly)
    await db
      .query(
        `insert into import_runs (id, started_at, finished_at, source, status, dry_run, detected_via, files_seen, files_changed,
         events_added, events_removed, events_changed, batch_id, error, actions_run_url)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          randomUUID(),
          startedAt,
          clock().toISOString(),
          source.id,
          outcome.status,
          dryRun,
          outcome.via,
          outcome.filesSeen,
          outcome.filesChanged,
          outcome.added,
          outcome.removed,
          outcome.changed,
          outcome.batchId,
          outcome.error,
          runUrl || null,
        ],
      )
      .catch((error) => {
        failed = true;
        console.error(
          `${source.id}: the import_runs row was not written: ${(error as Error).message}`,
        );
      });
  console.log(`${source.id}: ${outcome.status}${dryRun ? " (dry run)" : ""}`);
}

// Dead-man switch, per domain that opts in (domains.<domain>.coverageMinDays;
// a zone's type is its domain): its next dates are late somewhere. If the
// database is gone by now, the job fails and the workflow opens its failure
// issue.
try {
  for (const [name, settings] of Object.entries(config.domains)) {
    const minDays = settings.coverageMinDays;
    if (!minDays) continue;
    const lastDates = (
      await db.query(
        "select z.id as zone_id, max(e.start) as last from zones z left join events e on e.zone_id = z.id where z.type = $1 group by z.id order by z.id",
        [name],
      )
    ).rows.map((r) => ({
      zoneId: r.zone_id as string,
      last: r.last ? String(r.last).slice(0, 10) : null,
    }));
    const gaps = coverageGaps(lastDates, today, minDays);
    if (gaps.length)
      console.log(
        `\nCoverage: ${gaps.length} zone(s) run out within ${minDays} days:\n- ${gaps.join("\n- ")}`,
      );
    if (dryRun) continue;
    if (gaps.length)
      issues.raise(
        `coverage:${name}`,
        DOMAINS[name]?.coverageTitle ?? `${name}: coverage`,
        [
          `These zones have dates for fewer than ${minDays} more days, and no new schedule has been imported:`,
          "",
          ...gaps.map((g) => `- ${g}`),
          "",
          "Check whether the next schedule is published and why the import has not picked it up (RUNBOOK: docs/import.md). Closed automatically once every zone is covered.",
        ].join("\n"),
      );
    else
      issues.resolve(
        `coverage:${name}`,
        `Resolved: every zone has dates for ${minDays}+ days (${today}).`,
      );
  }
  if (!dryRun && !failed)
    issues.resolve(
      "workflow",
      `Resolved: the import ran on ${today}.${runUrl ? ` ${runUrl}` : ""}`,
    );
} catch (error) {
  failed = true;
  console.error(`\nCoverage check failed: ${(error as Error).message}`);
}
await db.close();
if (failed) {
  // The workflow's own failure issue would repeat the one just opened.
  if (process.env.GITHUB_OUTPUT && issued)
    appendFileSync(process.env.GITHUB_OUTPUT, "issued=true\n");
  process.exit(1);
}
