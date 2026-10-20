# Unattended schedule import

Every day, a GitHub Actions workflow checks the town's and the gmina's published waste schedules. A change that passes every check goes live on its own. Anything doubtful opens a GitHub issue instead, and nothing is applied. People only step in when an issue opens.

- Workflow: `.github/workflows/import-schedules.yml`. It runs on GitHub-hosted runners with no approval gates. Its only services are Neon, S3 (through an OIDC role) and Cursor CLI.
- Code: `web/scripts/schedules/` (`run.ts`, `adapters.ts`, `lib.ts`, `events-db.ts`, `issues.ts`, `revert.ts`).
- Config: **`etl/sources.yaml`**, the one config. A schema (`etl/sources.schema.json`) checks it, and `npm run config:check` fails CI if anything derived from it has drifted. That covers `docs/data/sources.md`, `web/lib/config.generated.ts` (footer features and public schedule pages), the workflow's cron lines, and the adapter types.

## What a run does

For each source in `etl/sources.yaml`:

1. **Detect.** The detector asks the WordPress REST API for the files: `wp-media` reads the city page's attachments, and `wp-post-files` reads the PDFs linked from the gmina's newest yearly post. If the API fails after retries, the run falls back to the watched pages and records `detected_via = page`. If both fail, the run fails and opens an issue.
2. **Watch.** The run hashes the schedule links in each watched page's content block, not the whole HTML, because the city page embeds a live calendar. A new link that detection didn't pick up stops the apply and opens an issue. The fix is a config change: adapt the source, or add the link to `ignore`.
3. **Fetch and archive.** Only files with a new media id or date are downloaded. A new file (new SHA-256) goes to `s3://conaulicy-sources-aaed02/sources/<origin>/<fetch date>/<file>` and into the `source_files` table (decision: the archive manifest for new files is that table; `docs/data/sources.md` lists only the initial archive).
4. **Extract.**
   - Gmina PDFs are read from their text layer (`pdftotext -layout`) and parsed deterministically.
   - City JPGs have no text layer. Two Cursor CLI vision passes from different vendors (`vision.passes`) read each one, and each pass must return JSON matching a strict schema. The result is applied only if both readings agree 100%.
   - The agent runs in an empty workspace holding only the image, with `permissions` denying shell, writes, web and MCP. Git, the database, S3 and issues are handled by the script, never by the agent.
5. **Validate.** The thresholds live in `import.validate`:
   - every date is in the schedule year;
   - each row keeps its usual weekday, unless a public holiday explains the move or the date is approved in `etl/review/approvals.yaml`;
   - dates per fraction stay within a sane range of last year;
   - no village or street disappears from, or appears in, a zone.
6. **Apply.** The diff for the file's scope (zone and year) is written in one transaction, logged row by row in `import_changes` under a batch id, and the site is revalidated.

Each run writes one `import_runs` row per source: status `no_change`, `applied`, `needs_review` or `failed`, plus counts, batch id, error and the Actions run URL. Then comes the **dead-man switch**: while any zone's last date is closer than `import.alerts.coverageMinDays` (21), one issue stays open. Every run also syncs `gminy.schedule_url` from `sources[].page`. If the gmina publishes a newer yearly post, an issue asks for the one-line config change.

**Issues** carry a hidden key, one open issue per problem, and nobody gets email beyond GitHub's own notifications. The next run that no longer sees the problem closes the issue with a comment.

**Self-healing:**
- A file waiting for review is re-extracted on every run, so it applies as soon as its fix (an approval or a config change) is merged.
- A failed source is retried by the day's next cron, and again the next day.
- Network calls retry with backoff (`import.retries`).

**Schedule:** `schedule.time` is in `schedule.timezone`. GitHub cron is UTC-only, so the workflow carries one cron per UTC offset (`0 3 * * *` for CEST, `0 4 * * *` for CET), and `--scheduled` runs only the sources that are due. A source is due once the time has passed today and no run has finished today, so the second cron is a free retry. **The schedule is off** (`schedule.enabled: false`, no cron lines) until Jakub's first production run.

**Adding a new kind of source** (e.g. water cuts posted on MZGKiM's RSS or the gmina's site): write a detector that returns one `Found` per post and an extractor that returns that post's events with its scope, both registered in `adapters.ts`. Add their type names to the schema enum, then a `sources` entry. Logging, issues, validation, batches and revert stay as they are.

## Secrets and access

| What | Where | Scope |
|---|---|---|
| `IMPORT_DATABASE_URL` | Actions secret | Neon role `conaulicy_import`: reads places and zones, writes `events`, `gminy.schedule_url` and the import tables, nothing else |
| `CURSOR_API_KEY` | Actions secret (Jakub's) | the two vision passes, only inside Actions |
| `REVALIDATE_SECRET` | Actions secret | `POST /api/revalidate` |
| AWS | OIDC role `conaulicy-import-gha` (`archive.role`), no keys | `s3:PutObject`/`GetObject` on `sources/*`, `s3:ListBucket` on the bucket; only `lbn21/conaulicy` `main` |

## RUNBOOK

**Run it by hand.** Actions → import-schedules → Run workflow, from `main`. Pick a mode:
- `extract-only`: no database. It reads every file, including both vision passes, and prints what it found.
- `dry-run`: compares with the database and writes only the `import_runs` row.
- `apply`: the real import.

`force_extract` re-reads files that are already known; with `dry-run` it proves the extraction still reproduces the database. Locally, without the vision key: `cd web && npm run import:schedules -- --read-only --force-extract`.

**Revert a batch.** The batch id is in the `import_runs` row and the run log.

```sh
cd web
npm run import:revert -- <batch id> --dry-run   # what would be undone
npm run import:revert -- <batch id>             # undo, one transaction; refuses twice, or if a later batch changed the same events
```

A reverted file stays settled: it is not re-applied until its source publishes a new version.

**Accept a flagged date.** Check it against the source, then add `{ zone_id, date, note }` to `etl/review/approvals.yaml` in a PR. The next run applies the schedule and closes the issue.

**Add or change a source, URL, time, model or threshold.** Edit `etl/sources.yaml`, run `cd web && npm run config:sync` (it rewrites everything derived, and prints the cron lines if the schedule changed), and open a PR. CI checks the schema and drift. New detector or extractor kinds need code in `adapters.ts`, as described above.

**Turn the schedule on.** Set `schedule.enabled: true`, run `npm run config:check`, and paste the cron lines it prints under `on: schedule:` in the workflow. Then open a PR.
