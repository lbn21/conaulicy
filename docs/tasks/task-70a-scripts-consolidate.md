# Task 70a: scripts and import, one copy of each shared step

Approved by Jakub, 23 Oct 2026, from the read-only duplication audit (main b68e6b5). First of three PRs (70a → 70b → 70c). Scope is exactly the items below: no other refactors, no new abstractions beyond those named. Behaviour stays identical except where stated.

## 1. Revalidate after a data change: one helper (audit finding 2)

Four copies of `POST /api/revalidate` have drifted:
- `web/scripts/import.ts:245-263` (site from env `SITE_URL`, adds `x-vercel-protection-bypass` from `VERCEL_AUTOMATION_BYPASS_SECRET`, fails on non-OK)
- `web/scripts/place-redirect.ts:81-90` (env `SITE_URL`, logs status only)
- `web/scripts/import/core/revert.ts:123-132` (`loadConfig().site.url`, logs status only)
- `web/scripts/import/core/run.ts:73-85` (`config.site.url`, throws on non-OK)

Make one `web/scripts/lib/revalidate.ts`, used by all four:
- Site URL: `loadConfig().site.url` (etl/sources.yaml), the same as the unattended import. `SITE_URL` env may still override it (keeps `import.ts`'s smoke check and local use working); document it in each script's header comment.
- Secret: `REVALIDATE_SECRET`; without it, log "Revalidate skipped …" and return (as today).
- Send the bypass header when `VERCEL_AUTOMATION_BYPASS_SECRET` is set.
- A non-OK reply is an error (throw); each caller keeps its own message on failure where it has one (`import.ts`: "The data is imported.").
- Log `Revalidate ok: <body>` on success.

## 2. Database URL: one function (audit finding 2)

Six lookups with `??` vs `||` and with/without `IMPORT_DATABASE_URL`: `import.ts:273`, `place-redirect.ts:41`, `import/core/run.ts:177`, `import/core/revert.ts:33`, `check-teryt.ts:145`, `lib/local-db.ts:8`.

Add `databaseUrl()` in `web/scripts/lib/local-db.ts` (rename the file only if that reads clearly; otherwise keep the name): `IMPORT_DATABASE_URL || DATABASE_URL_UNPOOLED || DATABASE_URL`, `||` so an empty variable falls through. `localDatabaseUrl()` uses it and keeps its local-only guard. Each caller keeps its own "not set" error message and its own production guard (`describeTarget` / `--yes-production` stay where they are).

## 3. Polish holidays: one copy (audit finding 3)

`web/scripts/ci-fixture.ts:200-241` (Easter + holidays, 24 Dec in every year) duplicates `polishHolidays` in `web/scripts/import/waste/lib.ts:185-224` (24 Dec from 2025). `ci-fixture.ts` imports `polishHolidays`; delete its own `easter`/`holidays`. The fixture's dates are current years, so its output is unchanged.

## 4. Check scripts: one ending (audit finding 15)

15 `web/scripts/check-*.mjs` end with the same "print `FAIL  …` lines, exit 1, else print summary" block, and 11 add `process.exit(0)` because the server's pipes keep Node alive. Add `finish(failures, summary)` to `web/scripts/lib/server.mjs` (prints FAIL lines and exits 1, else prints the summary and exits 0), and use it in every script whose ending is that exact pattern. Scripts with a different ending stay as they are. Output text stays the same.

## 5. Importer fraction labels (importer half of audit finding 1)

`web/scripts/import/waste/lib.ts:40-51` `LABELS` is the third copy of the fraction names (the PDF's `TONE_LABEL` and `lib/schedule.ts` order are the others; 70b unifies the web side). In this PR: add to `web/lib/waste-bin.ts` one ordered list of fractions with their labels, exactly the current importer labels plus `tworzywa: "Tworzywa sztuczne"` and `zmieszane_i_bio: "Zmieszane i bio"` (order as `SUBTYPE_ORDER` in `lib/schedule.ts:114-127`), and have the importer's `LABELS` come from it. Leave `ci-fixture.ts`'s own labels alone (made-up test data). 70b will point the PDF and `lib/schedule.ts` at the same list.

## Tests

- Unit tests where helpers are pure (holidays already tested; add a small `databaseUrl` test if cheap).
- All of CI green, especially `check-import`, `check-import-run`, and every `check-*.mjs` whose ending changed.

## Rules

- No `npm run db:*`, no local `next build`/`start`/`dev`/`check:*` reading `web/.env.local`. Rely on CI.
- Never `vercel env run`. No force-push. Stop on any safety block and report it. Never touch `~/projects/conaulicy`.
- Branch `chore/scripts-consolidate` (this brief is its first commit). Open a normal PR, wait for CI, report the PR number. Do not merge.
