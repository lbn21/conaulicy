# Unattended import

A GitHub Actions workflow checks the sources in `etl/sources.yaml`. Today that is one domain, waste: the town's and the gmina's published schedules. A change that passes every check goes live on its own. Anything doubtful opens a GitHub issue instead, and nothing is applied; a file a person must look at gets a review pull request with the original shown inline. People only step in when an issue or a review PR opens.

- Workflow: `.github/workflows/import.yml`. It runs on GitHub-hosted runners with no approval gates. It talks to Neon, S3 (through an OIDC role), the Cursor CLI, the GitHub API (issues and review PRs), the site's `/api/revalidate`, and the source sites themselves.
- Code: `web/scripts/import/`.
  - `core/` is shared by every domain: the run loop (`run.ts`), config, HTTP retries, watched pages, the vision runner and JSON extraction, issues and review PRs, the events diff, batches and revert.
  - `waste/` is the waste domain: detectors and extractors (`adapters.ts`), parsing and validation (`lib.ts`), its checks (`check.ts`) and its hooks into the core (`index.ts`: config rules, the `gminy.schedule_url` sync, database rows, issue wording).
  - `domains.ts` registers the domains.
- Config: **`etl/sources.yaml`**, the one config. A schema (`etl/sources.schema.json`) checks it, and `npm run config:check` fails CI if anything derived from it has drifted. That covers `docs/data/sources.md`, `web/lib/config.generated.ts` (footer features and public schedule pages), and the adapter types.

## What a run does

For each source in `etl/sources.yaml`:

1. **Detect.** The detector asks the WordPress REST API for the files: `wp-media` reads the city page's attachments, and `wp-post-files` reads the PDFs linked from the gmina's newest yearly post. If the API fails after retries, the run falls back to the watched pages and records `detected_via = page`. If both fail, the run fails and opens an issue.
2. **Watch.** The run hashes the schedule links in each watched page's content block, not the whole HTML, because the city page embeds a live calendar. A new link that detection didn't pick up stops the apply and opens an issue. The fix is a config change: adapt the source, or add the link to `ignore`.
3. **Fetch and archive.** Only files with a new media id or date are downloaded. A new file (new SHA-256) goes to `s3://conaulicy-sources-aaed02/sources/<origin>/<fetch date>/<file>` and into the `source_files` table (decision: the archive manifest for new files is that table; `docs/data/sources.md` lists only the initial archive).
4. **Extract.**
   - Gmina PDFs are read from their text layer (`pdftotext -layout`) and parsed deterministically.
   - City JPGs have no text layer. Two independent Cursor CLI vision passes (`vision.passes`, by id) read each one, and each pass must return JSON matching a strict schema. Prose or a code fence around the JSON is dropped: the first balanced object is taken. The dates are applied only if both readings agree 100% on sector, year and every date. If they don't, nothing from the file is applied and a review PR (below) proposes the `vision.reviewFrom` pass's reading (`opus`).
   - Why Grok and Opus (`grok-4.7-medium` and `claude-opus-5-5-medium`, both at medium effort through the Cursor CLI): two vendors' models fail independently, so a misread by one is very unlikely to be repeated cell for cell by the other, and any difference stops the apply. A misread both share is still possible; the validation below (weekdays, holidays, counts against last year) covers it. Opus gets the image downscaled by the model to about 2576 px on the long edge, and in testing it still read 632/632 town dates, agreeing with Grok on every date. The config accepts two passes of one vendor too (distinct ids), never `auto` or a `-fast` model.
   - Streets are never taken from a model. Only the `vision.streetCheckFrom` pass's street list (`opus`) is checked against the zone's streets in the database (`streetKey`, plus `aliases`); `grok-a` counts for dates, sector and year only, because it misreads street names (e.g. „Gen. Antoniego Jeziorskiego” for „Jeziorańskiego”) while Opus reads them right. A difference does not block the dates. Instead it opens an informational review PR for the file (below).
   - The agent runs in an empty workspace holding only the image, with `permissions` denying shell, writes, web and MCP. Git, the database, S3 and issues are handled by the script, never by the agent.
   - No database connection is held through the extraction: the vision passes take minutes, and Neon closes an idle connection. The run reconnects for the next query (`core/db.ts`). A dropped connection is retried once, except inside the apply transaction, which is lost and fails the source. A failure goes the normal way (a `failed` row and an issue), never a crash.
5. **Validate.** The domain checks each file. For waste, the thresholds live in `domains.waste.validate`:
   - every date is in the schedule year;
   - each row keeps its usual weekday, unless a public holiday explains the move or the date is approved in `etl/review/approvals.yaml`;
   - dates per fraction stay within a sane range of last year;
   - no village disappears from, or appears in, a gmina zone. City streets get the review PR above instead.
6. **Apply.** The diff for the file's scope (zone and year) is written in one transaction, logged row by row in `import_changes` under a batch id, and the site is revalidated (`revalidateTag("dataset")`: the data cache and the CDN copies of the PDF, ICS and search responses, which send `Vercel-Cache-Tag: dataset`).

Each run writes one `import_runs` row per source: status `no_change`, `applied`, `needs_review` or `failed`, plus counts, batch id, error and the Actions run URL. Then comes the **dead-man switch**, for each domain that opts in with `domains.<domain>.coverageMinDays` (waste: 21): while any of its zones' last date is closer than that, one issue stays open (key `coverage:<domain>`). Every waste run also syncs `gminy.schedule_url` from `sources[].page`. If the gmina publishes a newer yearly post, an issue asks for the one-line config change.

**Issues** carry a hidden key, one open issue per problem, and nobody gets email beyond GitHub's own notifications. The next run that no longer sees the problem closes the issue with a comment.

## Review pull requests

One PR per source file that needs a person (`core/review.ts`, waste content in `waste/check.ts`): passes that disagree (blocking) or streets that differ from the database (informational). It is opened by `dry-run` and `apply` runs (it is not a database write), never by `extract-only`, and it replaces the plain issue for these two cases.

- **Body (Polish):** the file's URL on the source site, its SHA-256 and the run link; a table of every differing sector, year, row and month with each pass's value and the database's; the street differences of the `vision.streetCheckFrom` pass; then the original image inline (full size, clickable) from its public URL on the source site, the one the import downloaded. A PDF would be linked.
- **Diff:** one file, `etl/review/<source>/<file stem>.yaml`, the proposed dates (pre-filled from `vision.reviewFrom`, month by month, easy to edit in "Files changed"). YAML, not JSON, so `check-tracked-data` keeps JSON off main as before.
- **Merge = approve.** The next run reads that file instead of running the passes, but only for the file whose `sha256` it names: if the source publishes a new version, the reviewed file is ignored and a new review opens. Merged reviews get no street review again.
- **Close = reject.** The database keeps its dates; the same version of the file is not reviewed again. For a street-only PR, merge or close both just acknowledge.
- **One PR per file:** the branch is `import-review/<source>/<file stem>`. While its PR is open, a run updates only the body (a person's edits to the YAML are kept); a new version of the file rewrites the branch. A version that reads clean closes a stale review as superseded.
- **The image is never in git (decision).** The body embeds the source site's public URL; GitHub's camo proxy fetches and serves it, so it renders on the web and in the mobile app. No source file is pushed to any branch. When the body is written, the import fetches that URL (with `import.retries`): if it now serves another SHA-256, or cannot be fetched, the body says the image may differ from the reviewed version. The SHA-256 is the authority.
- **The bot only force-pushes `import-review/*` branches,** never `main` or anyone else's branch. Vercel skips them: `web/vercel.json` turns deployments off for `import-review/**`.
- **CI does not run on these PRs:** they are opened with `GITHUB_TOKEN`, which by GitHub's design triggers no workflows. That is fine: the next import checks the reviewed file (schema, weekdays, holidays, counts) before applying it.
- **Needs** the workflow's `contents: write` and `pull-requests: write`, and the repository setting "Allow GitHub Actions to create and approve pull requests" (Settings → Actions → General). Without it the run fails with an issue naming that setting.

**Self-healing:**
- A file waiting for review is re-extracted on every run, so it applies as soon as its fix (an approval or a config change) is merged.
- A failed source is retried by the next run.
- Network calls retry with backoff (`import.retries`).

**Schedule:** there is no GitHub schedule: `schedule` events never fired in this repo (proven 22 Oct 2026). Today the import runs only when dispatched by hand (Actions → import → Run workflow). A daily external trigger is planned (Vercel Cron → `workflow_dispatch`).

**How the trigger calls it:**
- `POST https://api.github.com/repos/lbn21/conaulicy/actions/workflows/import.yml/dispatches`
- Headers: `Authorization: Bearer <token>`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`.
- Body: `{"ref":"main","inputs":{"mode":"apply"}}` (no `force_extract`; it defaults to `false`). Without `mode` the run is `extract-only` and changes nothing.
- Token: fine-grained, this repo only, permission Actions: read and write; stored only in the trigger's secrets.
- Concurrency `group: import` queues a second dispatch behind a running one; nothing runs in parallel.

**Adding a source or a domain:** see the RUNBOOK below.

## Secrets and access

| What | Where | Scope |
|---|---|---|
| `IMPORT_DATABASE_URL` | Actions secret | Neon role `conaulicy_import`: reads places and zones, writes `events`, `gminy.schedule_url` and the import tables, nothing else |
| `CURSOR_API_KEY` | Actions secret (Jakub's) | the two vision passes, only inside Actions |
| `REVALIDATE_SECRET` | Actions secret | `POST /api/revalidate` |
| AWS | OIDC role `conaulicy-import-gha` (`archive.role`), no keys | `s3:PutObject`/`GetObject` on `sources/*`, `s3:ListBucket` on the bucket; only `lbn21/conaulicy` `main` |

## RUNBOOK

**Run it by hand.** Actions → import → Run workflow, from `main`. Pick a mode:
- `extract-only`: no database. It reads every file, including both vision passes, and prints what it found.
- `dry-run`: compares with the database and writes only the `import_runs` row.
- `apply`: the real import.

`force_extract` re-reads files that are already known; with `dry-run` it proves the extraction still reproduces the database. Locally, without the vision key: `cd web && npm run import:run -- --read-only --force-extract`.

**Revert a batch.** The batch id is in the `import_runs` row and the run log.

```sh
cd web
npm run import:revert -- <batch id> --dry-run   # what would be undone
npm run import:revert -- <batch id>             # undo, one transaction; refuses twice, or if a later batch changed the same events
```

A reverted file stays settled: it is not re-applied until its source publishes a new version.

**Review PR: passes disagree.** Compare the table with the image in the PR. If the proposed dates (from `opus`) are right, merge. If not, fix the days in the YAML under "Files changed", then merge. To keep the database as it is, close the PR. Either way the next run (or `apply`) acts on it.

**Review PR: streets differ.** Check the image. If a street really joined or left the zone, change the database. If it is only spelled differently, add it to the source's `aliases` in `etl/sources.yaml`. Then merge or close the PR: both just acknowledge it.

**Accept a flagged date.** Check it against the source, then add `{ zone_id, date, note }` to `etl/review/approvals.yaml` in a PR. The next run applies the schedule and closes the issue.

**Add or change a source, URL, model or threshold.** Edit `etl/sources.yaml`, run `cd web && npm run config:sync` (it rewrites everything derived), and open a PR. CI checks the schema and drift.

### Adding a new source or domain

- **Another source of an existing kind** (e.g. a third gmina's PDFs): add a `sources` entry with `domain: waste`, the existing `detect` and `extract` types, and its `waste` block (`gmina`, `zone`, `validate`, optional `aliases`).
- **A new kind of waste source:** write a detector or extractor in `web/scripts/import/waste/adapters.ts`, add its type name to the schema enum (`etl/sources.schema.json`), then add a `sources` entry.
- **A new domain** (e.g. IMGW weather warnings, or water and power cuts posted on MZGKiM's RSS or the gmina's site), without touching waste code:
  1. Create `web/scripts/import/<domain>/` exporting a `Domain` (`core/domain.ts`). It needs detectors that return one `Found` per published item, extractors that return that item's events with their scope, `detectFromPages` for when the API is down, `check` with the domain's validations, `rows` (its events as database rows), `configErrors` (its sources' rules beyond the schema) and `fixHint` (how to fix a blocked file, for the issue). Optional: `afterDetect` (e.g. waste keeps `gminy.schedule_url` in step with the config) and `coverageTitle` with `domains.<domain>.coverageMinDays` for the dead-man switch.
  2. Register it in `web/scripts/import/domains.ts`.
  3. In `etl/sources.schema.json`, add its name to `sources.items.domain`, its types to the `detect` and `extract` enums (and its detectors' settings under `detect`), any settings under `domains.<domain>`, and its sources' own block under `sources.items.<domain>`.
  4. Add `domains.<domain>` and its `sources` entries (`domain: <domain>`, with a `<domain>` block if it has one) to `etl/sources.yaml`.
  5. Run `npm run config:sync`. CI fails if a registered domain or type is missing from the schema, or the other way round.
  The core does the rest: fetching, archiving, watched pages, diffing, batches, issues, `import_runs` and revert.
