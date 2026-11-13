# Database

One Neon project (Vercel Marketplace, free plan, fra1) and, for now, **one shared database: the Neon branch `main`** (endpoint `ep-snowy-cherry-b9v656vm`).

**Only the import uses it.** The site (every page, route handler, PDF, ICS, the home page's panel, search, the sitemap, metadata, `generateStaticParams`, every build and every cron, ZUK's included) reads one dataset snapshot from the private Blob store instead, never the database (below, "The dataset snapshot"). `web/scripts/check-runtime-db.mjs` fails CI if any file of the site's code (`web/app`, `web/components`, `web/lib`, `web/proxy.ts`, `web/next.config.ts`) imports the database client or schema (`web/db/`), Drizzle or a Postgres driver, or names a database variable.

| Who | Database | Env vars |
|---|---|---|
| The import (`.github/workflows/import.yml`) | Neon `main`, role `conaulicy_import` | `IMPORT_DATABASE_URL` (Actions secret) |
| Approved runs by hand (`db:*`, `dataset:*`, `import:revert`) | Neon `main` | `web/.env.local` |
| The site: Production, Preview, Development | none: the dataset snapshot (Blob) | `BLOB_READ_WRITE_TOKEN`; the integration's database variables are unused |
| CI (GitHub Actions) | throwaway `postgres:18` service, migrated and loaded with the CI fixture per run, for the import's checks and the snapshot's equivalence check only; the site's build and checks run without a database | in `.github/workflows/ci.yml`, no secrets |

Vercel "Preview Branching" (one Neon branch per deployment) stays off: the free plan allows 10 branches.

Anything that writes (`db:migrate`, `db:import --apply`, `db:redirect --apply`) changes production data, and with the next snapshot the live site:

- CI uses a made-up fixture (`npm run db:ci-fixture`, `web/scripts/ci-fixture.ts`); it refuses any database but a local one, and production never holds it.
- `db:import` refuses `--apply` on this endpoint unless `--yes-production` is passed (it compares the target with the integration's `PGHOST`).
- Before a write, back up as in "Writing to production" below. Neon's free plan also keeps 6 hours of restore history.

## Writing to production

An agent may run `db:migrate`, `db:import --apply` or `db:redirect --apply` on production **only after asking Jakub in chat and getting his explicit approval, every time**. One approval covers one run; it never carries over to the next.

Each approved run:

1. Back up first: `pg_dump -Fc` from Docker `postgres:18` (matching Neon's major version) into `~/.conaulicy-secret/backups/`, `chmod 600` the file, and check it with `pg_restore --list`. Note the UTC time as the Neon point-in-time restore marker.
2. Run the dry run and review it. Stop on any unexpected delete or change.
3. Apply.
4. Run the dry run again: it must show 0 changes.

An approved run reads production's URL from `web/.env.local` through the npm scripts (`npm run db:migrate`, `db:import`, `db:redirect`); nothing else may read that file: a local `next build`, `next start`, `next dev` or `npm run check:*` stays forbidden.

Never use `vercel env run` (Vercel CLI 64.5): it hands the command back to its own parser, so `vercel env run -e production -- node -e …` started a `vercel deploy` of the working tree (rejected only by luck). Use `web/.env.local` instead.

## The dataset snapshot

Everything the site needs of the database, in one JSON file (`web/lib/dataset-schema.ts`: its types and its check, `parseDataset`, which the site applies on every read): `schemaVersion`, `generatedAt`, the `batchId` it follows; gminy; localities and streets (retired ones too, with `retiredAt` and `replacedBy`; in `search` order); waste zones and their members (house-number ranges included); events, only the columns the site shows (no `payload` but `putOutBy`, no SHA-256, cells or review fields), each with its file's `source_files.lastSeenAt`; the redirects (`place_redirects` and retired places' `replacedBy`); the town's districts (`district_aliases`, for the water cron).

- **Writer** (`web/scripts/lib/dataset.ts`): built from the database on a read-only connection and published to the private Blob store, as the water, IMGW and PGE files: a new immutable version `dataset/v/<UTC time>-<content sha256>.json`, never overwritten, then the small pointer `dataset/current.json` (`version`, `path`, `sha256`, `generatedAt`, `previous`), so a failed write leaves the old snapshot live. The same content (hash without `generatedAt` and `batchId`) writes nothing. Called after every import run that may write, `import:revert`, `db:import --apply` and `db:redirect --apply`, then the site is revalidated; each fails loudly without `BLOB_READ_WRITE_TOKEN`. A local database (CI, `db:local`) is never published to the Blob store (only to `DATASET_DIR`, in tests).
- **By hand** (`web/scripts/dataset.ts`): `npm run dataset:build [-- --out <file>]` (read-only; prints the size), `dataset:publish`, `dataset:list`, `dataset:rollback -- --to <version>` (moves only the pointer, then revalidates; RUNBOOK in docs/import.md). In the import workflow: modes `snapshot` and `rollback`. Publishing or rolling back production's snapshot changes the live site: as "Writing to production", only with Jakub's approval for that run.
- **Reader** (`web/lib/dataset.ts`): the pointer is read from the Blob's origin inside a `"use cache"` scope (`cacheLife("max")`, the `dataset` tag), so it holds until the import's `POST /api/revalidate`; the version it names is read once per instance (it never changes) and kept in memory. The pages' reads (`web/lib/schedule.ts`, over `web/lib/dataset-views.ts`) are plain functions of it: today's day and a house number are filtered per call, never a cache key. Production without a token or a pointer is an error. Elsewhere (CI's build, a Preview before the first snapshot, `next dev`) the site shows the made-up dataset, `web/lib/dataset-fixture.ts`, the same rows `npm run db:ci-fixture` writes.
- **Equivalence** (`npm run check:dataset`, CI): on CI's database, every place's view (every house number its zones split on), every zone's events and ICS file, the home page's panel, the search index, the redirects and the examples, from the snapshot, deep-equal what the site's database queries gave (kept only there, as the reference).

## Places and zones

Every village and village part is a place of its own, whether or not it has streets (its streets are places too); the town is not, its streets are (`web/lib/dataset-views.ts`). A zone (`waste:miasto-s1` … `waste:gmina-s5`) links places to events. A village part (`czesc_wsi`) without a zone entry of its own takes its parent village's zone (`pickZone`, `web/lib/places.ts`). A street in no zone has no sector: the site says the data is missing and never guesses.

## TERYT names and renamed streets

Street names come from TERYT ULIC (`docs/data/sources.md`): `streets.prefix` is CECHA, `streets.nazwa_1` and `streets.nazwa_2` are NAZWA_1 and NAZWA_2 (null until an import with `--teryt` fills them), and `streets.name` is NAZWA_2 + NAZWA_1, what the pages show. The site reads only `prefix` and `name`, so it works with or without the two columns.

A renamed street gets a new SYM_UL, so a new page id. **No place is ever deleted** (`0004_retired_places`): one TERYT no longer lists is retired, `streets.retired_at` / `localities.retired_at` set, its row and address kept. `replaced_by` names the place that replaced it (a reviewed rename): `/adres/<old_id>` and everything under it answer 308 to the same path on it, query kept; with none, its page says it is no longer in the register (docs/import.md, "TERYT reload": the reload's review file sets both). `place_redirects (old_id, new_id, reason, created_at)` keeps the redirects of ids deleted before places were kept. A rename found after the reload is recorded by the reviewed step, never by an import or a workflow (it sets `replaced_by`, or writes `place_redirects` for an id with no row, then publishes the snapshot):

```sh
cd web
npm run db:redirect -- --from <old id> --to <new id> --reason "TERYT rename, issue #N"           # dry run
npm run db:redirect -- --from <old id> --to <new id> --reason "TERYT rename, issue #N" --apply --yes-production
```

## Import tables

The unattended import (docs/import.md) adds `import_runs` (one row per source per run), `import_changes` (every change by batch, for `npm run import:revert`), `source_files` (every source file by SHA-256, with its S3 key) and `source_pages` (watched pages' link hashes). It connects as the Neon role `conaulicy_import`, which can only read places and zones, write `events` and `gminy.schedule_url`, and write those four tables. To publish the dataset snapshot it also reads `place_redirects`, `district_aliases` and `district_alias_streets`: migration `0004_retired_places` grants that (and the new columns, where the role reads `streets` and `localities` by column), a no-op where the role does not exist; CI creates the role as production has it and checks the grants.

## District names (the gazetteer)

`district_aliases` (id, locality_id, teryt_simc, name, variants text[], confidence, source_url) holds a town's informal district names ("Osiedle Mazury"), `district_alias_streets` (alias_id, street_id, confidence, part, source_url; key alias_id + street_id) their streets: one district has many streets and a street may be in two (Herzoga: Mazury and Mazury VI), each with its own confidence (`high`, `medium`), source and, for a stretch only, `part` ("bloki 24–34A"). No foreign key to `localities` or `streets`, which hold only what the waste import brings; the seed checks every id against the TERYT snapshot instead. Written **only** by `npm run db:districts` (`web/scripts/districts-seed.ts`, from `web/lib/districts-seed.ts`: it replaces both tables in one transaction; without `--apply` it prints the difference, `--expect-no-changes` fails unless there is none); `npm run db:local` seeds it too. It refuses any database but a local one outside GitHub Actions: production runs only through `.github/workflows/prod-db.yml`, task `migrate-districts` (Jakub approves the run): backup, `db:migrate`, the dry run, `--apply --yes-production`, then `--expect-no-changes` (0 to add, 0 to remove). The water cron reads it through the dataset snapshot (docs/zuk.md), so after a seed run, publish the snapshot (`npm run dataset:publish`, or the import workflow's `snapshot`); the next import run publishes it anyway.

## Schema changes

Migrations only add what the code about to be deployed needs, and run before that deploy:

```sh
cd web
npm run db:migrate      # reads web/.env.local (Neon main)
```

The code may also ship first when it tolerates the old schema (for example, new columns the site never reads yet): merge, then, after a backup, `db:migrate` and any data reload (`npm run db:import -- --from <etl out> --teryt ../.cache/sources/teryt/<day> --apply --yes-production`; `npm run sources:pull` fetches the TERYT files). Both follow "Writing to production" above: by an agent only with Jakub's approval for that run.

`0003_district_aliases` runs on production through `prod-db.yml` task `migrate-districts` (Jakub approves the run), before the code that reads it is merged.

`0004_retired_places` (two nullable columns on `streets` and on `localities`, and the import role's reads for the snapshot) ran on production through `prod-db.yml` task `migrate` (#284) **before** the code that reads them was merged: the snapshot's builder, the TERYT check and `db:import` select them.

## Testing data changes without touching production

The site's code needs no database at all (the made-up snapshot, above). For the import's code, use the local database: `npm run db:local` (`web/docker-compose.yml`, Postgres 18 on 127.0.0.1) runs the migrations and the CI fixture, with every database variable set to its fixed local URL, so `.env.local` cannot redirect it. Then `db:import` with `DATABASE_URL` and `DATABASE_URL_UNPOOLED` set to `postgres://ci:ci@127.0.0.1:5432/conaulicy`, exactly as CI does (`scripts/check-import.mjs`). No real or production data is ever copied locally.
