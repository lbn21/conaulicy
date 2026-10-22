# Task 57: remove the GitHub schedule machinery from the import

Approved by Jakub, 22 Oct 2026. Branch: `chore/remove-schedule` (from `main` 6cd01a3).

## Why

GitHub `schedule` events never fire in lbn21/conaulicy. Proven on 22 Oct 2026: a `*/5` echo probe got 0 runs in 47 min (PR #77, removed in #78) and the import's crons never ran. `workflow_dispatch` and CI work normally. A future external trigger (Vercel Cron calling `workflow_dispatch`; NOT part of this task) will start the import once a day at one fixed UTC time. DST handling is not needed: an hour of drift does not matter to the import.

So all code that exists only to serve GitHub's cron goes: cron lines, `schedule` in the config, cron generation and its drift check, the `Due` step and `--scheduled`. **Less code is the goal. Add no new logic.**

## Changes

### `.github/workflows/import.yml`
- Remove the `schedule:` block and the comment above it. `on:` keeps only `workflow_dispatch` with its two inputs (`mode`, `force_extract`) unchanged.
- Keep `permissions` and `concurrency: { group: import, cancel-in-progress: false }` exactly as they are.
- Remove the `Due` step and every `if: steps.due.outputs.skip != 'true'` (drop the `if:` entirely where that was its only condition).
- `github.event_name == 'schedule' || inputs.mode == 'apply'` becomes `inputs.mode == 'apply'` (AWS step, "Open an issue" step).
- Import step: drop the `schedule/*) flags="--scheduled"` case and the `EVENT` env var; the `case` switches on `$MODE` only (`extract-only` → `--extract-only`, `dry-run` → `--dry-run`, `apply` → no flag).
- Default `mode` stays `extract-only` (a manual click must stay safe). The external trigger will dispatch with `mode=apply` explicitly.
- Update the header comment: started by `workflow_dispatch` only; no GitHub schedule (it never fired in this repo); daily runs come from an external trigger (planned) dispatching `mode=apply`. Drop "CI fails if this file drifts from it" if it now refers only to crons.

### `etl/sources.yaml` and `etl/sources.schema.json`
- Remove the whole top-level `schedule:` block (`enabled`, `time`, `timezone`) and its comment; fix the header comment (no "when the import runs", no "the import workflow's cron lines").
- Schema: remove `schedule` from `required` and from `properties`.
- There are no per-domain schedule fields today; keep every per-source / per-domain validation rule as is.

### `web/scripts/import/core/config.ts` (+ `config.test.ts`)
- `Config` type: remove `schedule`.
- `configErrors`: remove the `schedule.timezone` check. Keep all other checks.
- Remove `cronLines` and `utcOffsetHours`.
- `localNow` is used by `run.ts` only for `today` (Warsaw date) and the due hour. Replace it in `run.ts` with the existing `todayInWarsaw(clock())` from `web/lib/dates.ts` (import it by relative path like other scripts do; check how `web/scripts` already imports from `web/lib`). Then remove `localNow` if nothing else uses it. If importing `web/lib/dates.ts` from the import core is not possible without new plumbing, keep `localNow` and call it with the `WARSAW` constant / `"Europe/Warsaw"` instead of `config.schedule.timezone`; say which you did in the PR.
- Tests: remove the `schedule.time` test case, the cron test, and the `localNow` test if `localNow` is removed. Keep the rest.

### `web/scripts/import/core/run.ts`
- Remove the `scheduled` option, its header comment paragraph, and the whole `if (args.scheduled && tracked) { ... }` block; `due` becomes simply `config.sources` (or loop over `config.sources` directly and drop `due`).
- Fix the issue text "It is retried by the next scheduled run." → "It is retried by the next run." Keep everything else.
- Usage line at the top: drop `[--scheduled]`.

### `web/scripts/config-sync.ts` / `npm run config:check`
- Remove only the "workflow's crons must be exactly those the schedule implies" block (and the now-unused imports such as `cronLines`, and the workflow YAML read if it is only used there).
- Keep `config:check` / `config:sync` and their other checks (docs/data/sources.md, web/lib/config.generated.ts, schema ⇄ registered domains/types). Keep the CI step `npm run config:check`; just rename its label if it mentions crons (it does not today).
- Check the generated files (`docs/data/sources.md`, `web/lib/config.generated.ts`) do not contain schedule output; if `config-sync.ts` writes schedule info there, drop it and regenerate with `npm run config:sync` (this reads only etl/sources.yaml, no DB, no env).

### `web/scripts/check-import-run.mjs` (CI-only integration check)
- Remove `schedule: { ...real.schedule, enabled: true }` from its config override.
- Remove the step `"scheduled: not before the run time, once a day"`.
- Fix the `NOW` comment ("after the 05:23 run time" → just "11:00 in Warsaw"). Keep the `NOW` value and everything else.

### Docs
- `docs/import.md`: replace the **Schedule** paragraph with: there is no GitHub schedule (`schedule` events never fired in this repo, proven 22 Oct 2026); today the import runs only when dispatched by hand (Actions → import → Run workflow); a daily external trigger is planned (Vercel Cron → `workflow_dispatch`). Add a short "How the trigger calls it" subsection:
  - `POST https://api.github.com/repos/lbn21/conaulicy/actions/workflows/import.yml/dispatches`
  - headers `Authorization: Bearer <token>`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`
  - body `{"ref":"main","inputs":{"mode":"apply"}}` (no `force_extract`; it defaults to `false`). Without `mode` the run is `extract-only` and changes nothing.
  - token: fine-grained, this repo only, permission Actions: read and write; stored only in the trigger's secrets.
  - concurrency `group: import` queues a second dispatch behind a running one; nothing runs in parallel.
  - Self-healing bullet "A failed source is retried by the day's next cron, and again the next day" → "A failed source is retried by the next run."
  - RUNBOOK: drop "time" and "prints the cron lines if the schedule changed" from "Add or change a source, URL, time, model or threshold"; delete the "A domain on its own schedule" bullet and the "Turn the schedule on" paragraph.
- `CLAUDE.md` line about production data changing "daily at 05:23 Europe/Warsaw": say it changes when the import runs (dispatched by hand now; a daily external trigger is planned).
- `docs/import-plan.md`: only touch it if it states the daily time or GitHub cron as current behaviour (its "cron for source-change detection" out-of-scope note is history; leave it).
- Final grep must be clean of the removed machinery: `git grep -nE "05:23|--scheduled|cronLines|schedule\.(time|enabled|timezone)|localNow|on: schedule"` (leave historical `docs/tasks/*` files alone).

## Hard rules
- CI only: no local DB runs, no local `check-import*.mjs`, no local `next build` (it reads `web/.env.local`). Local `npm test`, `npx biome ci`, `npx tsc --noEmit` and `npm run config:check` are fine.
- Never print secrets. No force-push. Do not touch `stash@{0}`. Never touch `~/projects/conaulicy`.
- Do NOT dispatch any import run.
- Scope only: no unrelated changes or refactors.
- If a safety block appears, stop and report; never rephrase around it.

## Done
One commit on `chore/remove-schedule` (this brief included), PR titled "Remove the GitHub schedule from the import (it never fires)", CI green. Do not merge; report the PR link, `git diff --stat origin/main`, and which `localNow` option you took. The reviewer merges (squash) after checking the diff.
