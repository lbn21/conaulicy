# Database

One Neon project (Vercel Marketplace, free plan, fra1) and, for now, **one shared database: the Neon branch `main`** (endpoint `ep-snowy-cherry-b9v656vm`). The separate `preview` branch from docs/import-plan.md section 1 was abandoned; Jakub deletes it.

| Environment | Database | Env vars |
|---|---|---|
| Production | Neon `main` | from the Vercel–Neon integration |
| Preview (every non-`main` git branch) | Neon `main`, the same data as production | same integration vars |
| Development (`vercel env pull`, `web/.env.local`) | Neon `main` | same integration vars |
| CI (GitHub Actions) | throwaway `postgres:18` service, migrated and loaded with the CI fixture per run | in `.github/workflows/ci.yml`, no secrets |

Vercel "Preview Branching" (one Neon branch per deployment) stays off: the free plan allows 10 branches.

So every environment reads and writes production data. Previews only read; anything that writes (`db:migrate`, `db:import --apply`) changes the live site:

- CI uses a made-up fixture (`npm run db:ci-fixture`, `web/scripts/ci-fixture.ts`); it refuses any database but a local one, and production never holds it.
- `db:import` refuses `--apply` on this endpoint unless `--yes-production` is passed (it compares the target with the integration's `PGHOST`).
- Before a write, back up as in "Writing to production" below. Neon's free plan also keeps 6 hours of restore history.

## Writing to production

Jakub's rule (23 Oct 2026): an agent may run `db:migrate`, `db:import --apply` or `db:redirect --apply` on production **only after asking Jakub in chat and getting his explicit approval, every time**. One approval covers one run; it never carries over to the next.

Each approved run:

1. Back up first: `pg_dump -Fc` from Docker `postgres:18` (matching Neon's major version) into `~/.conaulicy-secret/backups/`, `chmod 600` the file, and check it with `pg_restore --list`. Note the UTC time as the Neon point-in-time restore marker.
2. Run the dry run and review it. Stop on any unexpected delete or change.
3. Apply.
4. Run the dry run again: it must show 0 changes.

An approved run reads production's URL from `web/.env.local` through the npm scripts (`npm run db:migrate`, `db:import`, `db:redirect`); nothing else may read that file: a local `next build`, `next start`, `next dev` or `npm run check:*` stays forbidden.

Never use `vercel env run` (Vercel CLI 64.5): it hands the command back to its own parser, so `vercel env run -e production -- node -e …` started a `vercel deploy` of the working tree (rejected only by luck). Use `web/.env.local` instead.

## Places and zones

Every village and village part is a place of its own, whether or not it has streets (its streets are places too); the town is not, its streets are (`villagePlaces`, `web/lib/schedule.ts`). A zone (`waste:miasto-s1` … `waste:gmina-s5`) links places to events. A village part (`czesc_wsi`) without a zone entry of its own takes its parent village's zone (`pickZone`, `web/lib/places.ts`). A street in no zone has no sector: the site says the data is missing and never guesses.

## TERYT names and renamed streets

Street names come from TERYT ULIC (`docs/data/DATA-INVENTORY.md` section 7): `streets.prefix` is CECHA, `streets.nazwa_1` and `streets.nazwa_2` are NAZWA_1 and NAZWA_2 (null until an import with `--teryt` fills them), and `streets.name` is NAZWA_2 + NAZWA_1, what the pages show. The site reads only `prefix` and `name`, so it works with or without the two columns.

A renamed street gets a new SYM_UL, so a new page id. `place_redirects (old_id, new_id, reason, created_at)` keeps the old address: `/adres/<old_id>` and everything under it answer 308 to the same path on `new_id`, query kept; a missing table means no redirects. Rows are written **only** by the reviewed step, never by an import or a workflow: after the TERYT check's issue has been reviewed and the rename imported,

```sh
cd web
npm run db:redirect -- --from <old id> --to <new id> --reason "TERYT rename, issue #N"           # dry run
npm run db:redirect -- --from <old id> --to <new id> --reason "TERYT rename, issue #N" --apply --yes-production
```

## Import tables

The unattended import (docs/import.md) adds `import_runs` (one row per source per run), `import_changes` (every change by batch, for `npm run import:revert`), `source_files` (every source file by SHA-256, with its S3 key) and `source_pages` (watched pages' link hashes). It connects as the Neon role `conaulicy_import`, which can only read places and zones, write `events` and `gminy.schedule_url`, and write those four tables.

## District names (the gazetteer)

`district_aliases` (id, locality_id, teryt_simc, name, variants text[], confidence, source_url) holds a town's informal district names ("Osiedle Mazury"), `district_alias_streets` (alias_id, street_id, confidence, part, source_url; key alias_id + street_id) their streets: one district has many streets and a street may be in two (Herzoga: Mazury and Mazury VI), each with its own confidence (`high`, `medium`), source and, for a stretch only, `part` ("bloki 24–34A"). No foreign key to `localities` or `streets`, which hold only what the waste import brings; the seed checks every id against the TERYT snapshot instead. Written **only** by `npm run db:districts` (`web/scripts/districts-seed.ts`, from `web/lib/districts-seed.ts`: it replaces both tables in one transaction; without `--apply` it prints the difference, `--expect-no-changes` fails unless there is none); `npm run db:local` seeds it too. It refuses any database but a local one outside GitHub Actions: production runs only through `.github/workflows/prod-db.yml`, task `migrate-districts` (Jakub approves the run): backup, `db:migrate`, the dry run, `--apply --yes-production`, then `--expect-no-changes` (0 to add, 0 to remove). The water cron will read it (docs/zuk.md); a missing table fails its runs, so the migration and seed run on production **before** the code that reads them is merged.

## Schema changes

Migrations only add what the code about to be deployed needs, and run before that deploy:

```sh
cd web
npm run db:migrate      # reads web/.env.local (Neon main)
```

The code may also ship first when it tolerates the old schema, as for `0002_teryt_names` (task 67): merge (the site never reads the new columns, and a missing `place_redirects` means no redirects); then, after a backup, `db:migrate` and a data reload with `npm run db:import -- --from <etl out> --teryt ../.cache/sources/teryt/<day> --apply --yes-production` (`npm run sources:pull` fetches the TERYT files), which fills `nazwa_1` and `nazwa_2`. Both follow "Writing to production" above: by an agent only with Jakub's approval for that run.

`0003_district_aliases` (task 151): on production through `prod-db.yml` task `migrate-districts` (Jakub approves the run), before the code that reads it is merged.

Applied to production on 2026-10-23: `0002_teryt_names` at 10:06 UTC (11:06 UK time); the TERYT reload at 10:07 UTC filled `nazwa_1` for 276 streets and `nazwa_2` for 82; the dry run after it showed 0 changes. The 276 include 3 streets in no zone, which the search index leaves out (273 there).

## Testing data changes without touching production

Use the local database: `npm run db:local` (`web/docker-compose.yml`, Postgres 18 on 127.0.0.1) runs the migrations and the CI fixture, with every database variable set to its fixed local URL, so `.env.local` cannot redirect it. Then `db:import` with `DATABASE_URL` and `DATABASE_URL_UNPOOLED` set to `postgres://ci:ci@127.0.0.1:5432/conaulicy`, exactly as CI does (`scripts/check-import.mjs`). No real or production data is ever copied locally (Jakub's decision, 24 Oct 2026).

## If a separate preview database is wanted later

Create a child branch of `main` in the Neon Console (Vercel → Storage → conaulicy → Open in Neon → Branches), give Preview its own sensitive `DATABASE_URL` / `DATABASE_URL_UNPOOLED`, and scope the integration to Production + Development. "Reset from parent" in the Neon Console then refreshes it from `main`.
