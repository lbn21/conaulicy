# Unattended import

A GitHub Actions workflow checks the sources in `etl/sources.yaml`. Today that is one domain, waste: the town's and the gmina's published schedules. Every new schedule file is read once by Grok and goes to a person in a review pull request, with the original shown inline, even when every check passes; nothing from it applies until the PR is merged. A merged review's dates go live on their own once they pass the date rules. Anything else doubtful opens a GitHub issue instead, and nothing is applied. People only step in when an issue or a review PR opens.

- Workflow: `.github/workflows/import.yml`. It runs on GitHub-hosted runners with no approval gates. It talks to Neon, S3 (through an OIDC role), the xAI API (Grok), the GitHub API (issues and review PRs), the site's `/api/revalidate`, and the source sites themselves.
- Code: `web/scripts/import/`.
  - `core/` is shared by every domain: the run loop (`run.ts`), config, HTTP retries, watched pages, issues and review PRs, the events diff, batches and revert.
  - `waste/` is the waste domain: detectors and the one extractor (`adapters.ts`), the prompts (`prompts.ts`), the xAI call (`xai.ts`, through `web/lib/zuk-ai.ts`, shared with the water reader), the literal checks, validation and review content (`lib.ts`), its checks (`check.ts`) and its hooks into the core (`index.ts`: config rules, the `gminy.schedule_url` sync, database rows, issue wording).
  - `domains.ts` registers the domains.
- Config: **`etl/sources.yaml`**, the one config. A schema (`etl/sources.schema.json`) checks it, and `npm run config:check` fails CI if anything derived from it has drifted. That covers `docs/data/sources.md`, `web/lib/config.generated.ts` (footer features and public schedule pages), and the adapter types.

## What a run does

For each source in `etl/sources.yaml`:

1. **Detect.** The detector asks the WordPress REST API for the files: `wp-media` reads the city page's attachments, and `wp-post-files` reads the PDFs linked from the gmina's newest yearly post. If the API fails after retries, the run falls back to the watched pages and records `detected_via = page`. If both fail, the run fails and opens an issue.
2. **Watch.** The run hashes the schedule links in each watched page's content block, not the whole HTML, because the city page embeds a live calendar. A new link that detection didn't pick up stops the apply and opens an issue. The fix is a config change: adapt the source, or add the link to `ignore`.
3. **Fetch and archive.** Only files with a new media id or date are downloaded. A new file (new SHA-256) goes to `s3://conaulicy-sources-aaed02/sources/<origin>/<fetch date>/<file>` and into the `source_files` table (decision: the archive manifest for new files is that table; `docs/data/sources.md` lists only the initial archive).
4. **Extract.** One extractor, `waste-ai`, for both sources (`extract: { type: waste-ai, layout: gmina | miasto }`). Code never parses, strips or cleans source text or the model's text: Grok reads, the code only checks literally what it returned, and a person reviews every new schedule. A problem with a reading is fixed in the prompt, with a dry run, never in code.
   - **The image.** A gmina PDF is rendered to one PNG (`pdftoppm -r 150 -png -singlefile`, at most 60 s per call; no text layer is read). It must have one page: the page count is the number of pages `pdftoppm` renders, so more than one fails the file ("N pages, expected 1"). A city JPG is sent as is.
   - **One reading.** Grok 4.7 (`grok-4.7`, reasoning medium) through the xAI API, `XAI_API_KEY`, the same client as the water reader: one user message, the prompt and then the image inline (`detail: high`); no system message, no temperature, no `response_format`, exactly as the dry run of 27 Oct 2026. Timeout 300 s, no retries in the client; a failed call fails the file (an issue), and the next run tries again. Model, tokens, cost and time are logged per file, never the prompt, image or key.
   - **The prompts** (`waste/prompts.ts`): Jakub's instruction text per layout, verbatim, then one line per listed place from the TERYT snapshot (`web/lib/zuk-places.generated.ts`): the gmina's villages (`<SIMC> <name>`, kind `wies` only) or the town's streets (`<SYM_UL> <CECHA> <name>`), sorted by name. Tests pin the sha256 of both instruction parts and both assembled prompts, so a change to either (or to the snapshot) fails on purpose and needs a new dry run.
   - **Literal checks** (`checkReply`): the reply is `JSON.parse`d as given (prose or a fence around it is "reply is not JSON"); exact keys and types as the prompt's shape; `month_header === months[month - 1]`; each city date's `above` is null or a date of the band directly above in the same month (null in the top band); every place id is null or one of the ids sent; sector null for the gmina and the file name's for the city; the year the file name's; `unplaced` empty. Rows are built structurally (`rows[row][month - 1]` gets the day). Each finding is a line in the review PR; none is ever fixed by code. These checks catch a reading that contradicts itself, not one that is wrong and consistent (the 2026 S2 dry run read the bulky 16 September under October, with a matching `above`): that is what the review is for.
   - **Places by id only.** The ids Grok chose are compared with the zone's members in the database (`localities.id` of its villages, `streets.teryt` of its town streets): on the file but not in the zone, in the zone but not on the file, and places with no id (never guessed). The import never changes membership.
   - No database connection is held through the extraction: the reading takes minutes, and Neon closes an idle connection. The run reconnects for the next query (`core/db.ts`). A dropped connection is retried once, except inside the apply transaction, which is lost and fails the source. A failure goes the normal way (a `failed` row and an issue), never a crash.
5. **Validate.** The domain checks each file. For waste, the thresholds live in `domains.waste.validate`:
   - every date is in the schedule year;
   - each row keeps its usual weekday, unless a public holiday explains the move or the date is approved in `etl/review/approvals.yaml`;
   - dates per fraction stay within a sane range of last year;
   - who the zone serves is never decided here: the places' lists above go into the review PR (`validate: members`).
6. **Apply.** The diff for the file's scope (zone and year) is written in one transaction, logged row by row in `import_changes` under a batch id, and the site is revalidated (`revalidateTag("dataset")`: the data cache and the CDN copies of the PDF, ICS and search responses, which send `Vercel-Cache-Tag: dataset`).

Each run writes one `import_runs` row per source: status `no_change`, `applied`, `needs_review` or `failed`, plus counts, batch id, error and the Actions run URL. Then comes the **dead-man switch**, for each domain that opts in with `domains.<domain>.coverageMinDays` (waste: 21): while any of its zones' last date is closer than that, one issue stays open (key `coverage:<domain>`). Every waste run also syncs `gminy.schedule_url` from `sources[].page`. If the gmina publishes a newer yearly post, an issue asks for the one-line config change.

**Issues** carry a hidden key, one open issue per problem, and nobody gets email beyond GitHub's own notifications. The next run that no longer sees the problem closes the issue with a comment.

## Review pull requests

Every new schedule goes to a person (`core/review.ts`, waste content in `waste/check.ts`). The rule:
- A file whose sha256 has no merged review gets **one blocking review PR**, even when every check passes and the reading equals the database. Nothing from it applies until a person merges the PR.
- `force_extract` reads a file again even when it is settled or matches the database, and opens a review PR for it; only a file whose sha256 has a merged review in the checkout is not read again (the merged YAML is used, no xAI call, no new PR).
- A normal run does not read a settled file again; a file whose sha256 has a merged review in `etl/review` opens no PR: the merged YAML replaces the reading and applies.
- The review status is looked up before the xAI call: a sha256 with an open, merged or rejected review is not read again (with or without `force_extract`), so it never costs a second call and its PR is not rewritten. A new sha256 gets a fresh read.

The PR is opened by `dry-run` and `apply` runs (it is not a database write), never by `extract-only`.

- **Body (Polish):** the file's URL on the source site, its SHA-256 and the run link; the model, tokens and cost; sector and year as read against the file name; the literal checks' findings; a table of every row and month with the reading's days, the month header as read and the database's days, differences marked; the dates Grok could not place (`unplaced`); the three places' lists; the date rules' findings (weekdays, holidays, counts); Grok's reply as given; then the original image inline (full size, clickable) from its public URL on the source site, the one the import downloaded. A PDF is linked.
- **Diff:** one file, `etl/review/<source>/<file stem>.yaml`: the reading's dates (month by month, easy to edit in "Files changed"), sector, year and the places as returned (information only: membership comes only from the database). A reply without the expected shape pre-fills no dates. YAML, not JSON, so `check-tracked-data` keeps JSON off main as before.
- **Merge = approve.** The next run reads that file instead of calling Grok, but only for the file whose `sha256` it names: if the source publishes a new version, the reviewed file is ignored and a new review opens. The merged file gets the same literal checks (keys, sector, year, integer days, place ids) and the date rules before it applies.
- **Close = reject.** The database keeps its dates; the same version of the file is not reviewed again.
- **One PR per file:** the branch is `import-review/<source>/<file stem>`. While its PR is open, a run updates only the body (a person's edits to the YAML are kept); a new version of the file rewrites the branch. A version whose merged review applies closes a stale review of another version as superseded.
- **The image is never in git (decision).** The body embeds the source site's public URL; GitHub's camo proxy fetches and serves it, so it renders on the web and in the mobile app. No source file is pushed to any branch. When the body is written, the import fetches that URL (with `import.retries`): if it now serves another SHA-256, or cannot be fetched, the body says the image may differ from the reviewed version. The SHA-256 is the authority.
- **The bot only force-pushes `import-review/*` branches,** never `main` or anyone else's branch. Vercel skips them: `web/vercel.json` turns deployments off for `import-review/**`.
- **CI does not run on these PRs:** they are opened with `GITHUB_TOKEN`, which by GitHub's design triggers no workflows. That is fine: the next import checks the reviewed file (literal checks, weekdays, holidays, counts) before applying it.
- **Needs** the workflow's `contents: write` and `pull-requests: write`, and the repository setting "Allow GitHub Actions to create and approve pull requests" (Settings → Actions → General). Without it the run fails with an issue naming that setting.

**Self-healing:**
- A file whose sha256 already has a review PR (open, merged but not in the checkout yet, or rejected) is never read again: no xAI call, and its PR is left exactly as it is. It applies as soon as its review is merged. A held file holds its whole source: nothing from that source applies until all its reviews are merged (the PR says so).
- A failed source is retried by the next run.
- Network calls retry with backoff (`import.retries`).

**Schedule:** there is no GitHub schedule: `schedule` events never fired in this repo (proven 22 Oct 2026). Vercel Cron starts it daily at 04:17 UTC: `/api/cron/import` (`web/lib/import-cron.ts`, production only) dispatches `import.yml` with `mode=apply`, using the `IMPORT_DISPATCH_TOKEN` env var. It can still be dispatched by hand (Actions → import → Run workflow).

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
| `XAI_API_KEY` | Actions secret | waste schedules only: Grok reads each new file, only inside Actions |
| `REVALIDATE_SECRET` | Actions secret | `POST /api/revalidate` |
| AWS | OIDC role `conaulicy-import-gha` (`archive.role`), no keys | `s3:PutObject`/`GetObject` on `sources/*`, `s3:ListBucket` on the bucket; only `lbn21/conaulicy` `main` |

## RUNBOOK

**Run it by hand.** Actions → import → Run workflow, from `main`. Pick a mode:
- `extract-only`: no database and no review PR. It reads every file (one xAI call each, unless a merged review covers it) and prints the literal checks' and date rules' findings; it exits 1 on any.
- `dry-run`: compares with the database, opens the review PRs, and writes only the `import_runs` row.
- `apply`: the real import.

`force_extract` reads files that are already known and settled again: each gets a review PR (unless its sha256 has a merged review), so a person compares the reading with the database. This is how a new year's import is rehearsed. Each read is a paid xAI call. Locally, without the key, use `--read-only` only on files that have merged reviews.

**Revert a batch.** The batch id is in the `import_runs` row and the run log.

```sh
cd web
npm run import:revert -- <batch id> --dry-run   # what would be undone
npm run import:revert -- <batch id>             # undo, one transaction; refuses twice, or if a later batch changed the same events
```

A reverted file stays settled: it is not re-applied until its source publishes a new version.

**Review PR: a new schedule.** Compare every date in the table with the image in the PR, column by column (a consistent misreading passes every literal check), and read the findings and the places' lists. If the dates are right, merge. If not, fix the days in the YAML under "Files changed", then merge (Jakub OKs). To keep the database as it is, close the PR. Either way the next run (or `apply`) acts on it. If a street or village really joined or left the zone, change the database; the import never does. A finding that keeps coming back is fixed in the prompt, with a dry run.

**Accept a flagged date.** Check it against the source, then add `{ zone_id, date, note }` to `etl/review/approvals.yaml` in a PR. The next run applies the schedule and closes the issue.

**Add or change a source, URL, model or threshold.** Edit `etl/sources.yaml`, run `cd web && npm run config:sync` (it rewrites everything derived), and open a PR. CI checks the schema and drift.

### Adding a new source or domain

- **Another source of an existing kind** (e.g. a third gmina's PDFs): add a `sources` entry with `domain: waste`, the existing `detect` and `extract` types, and its `waste` block (`gmina`, `zone`, `validate`).
- **A new kind of waste source:** write a detector in `web/scripts/import/waste/adapters.ts`, or a new layout (its prompt in `prompts.ts`, a dry run, its rows in `lib.ts`), add its name to the schema enum (`etl/sources.schema.json`), then add a `sources` entry.
- **A new domain** (e.g. IMGW weather warnings, or water and power cuts posted on MZGKiM's RSS or the gmina's site), without touching waste code:
  1. Create `web/scripts/import/<domain>/` exporting a `Domain` (`core/domain.ts`). It needs detectors that return one `Found` per published item, extractors that return that item's events with their scope, `detectFromPages` for when the API is down, `check` with the domain's validations, `rows` (its events as database rows), `configErrors` (its sources' rules beyond the schema) and `fixHint` (how to fix a blocked file, for the issue). Optional: `afterDetect` (e.g. waste keeps `gminy.schedule_url` in step with the config) and `coverageTitle` with `domains.<domain>.coverageMinDays` for the dead-man switch.
  2. Register it in `web/scripts/import/domains.ts`.
  3. In `etl/sources.schema.json`, add its name to `sources.items.domain`, its types to the `detect` and `extract` enums (and its detectors' settings under `detect`), any settings under `domains.<domain>`, and its sources' own block under `sources.items.<domain>`.
  4. Add `domains.<domain>` and its `sources` entries (`domain: <domain>`, with a `<domain>` block if it has one) to `etl/sources.yaml`.
  5. Run `npm run config:sync`. CI fails if a registered domain or type is missing from the schema, or the other way round.
  The core does the rest: fetching, archiving, watched pages, diffing, batches, issues, `import_runs` and revert.
