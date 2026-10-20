# Database

One Neon project (Vercel Marketplace, free plan, fra1) and, for now, **one shared database: the Neon branch `main`** (endpoint `ep-snowy-cherry-b9v656vm`). The separate `preview` branch from docs/import-plan.md section 1 was abandoned; Jakub deletes it.

| Environment | Database | Env vars |
|---|---|---|
| Production | Neon `main` | from the Vercel–Neon integration |
| Preview (every non-`main` git branch) | Neon `main`, the same data as production | same integration vars |
| Development (`vercel env pull`, `web/.env.local`) | Neon `main` | same integration vars |
| CI (GitHub Actions) | throwaway `postgres:17` service, migrated and loaded with the CI fixture per run | in `.github/workflows/ci.yml`, no secrets |

Vercel "Preview Branching" (one Neon branch per deployment) stays off: the free plan allows 10 branches.

So every environment reads and writes production data. Previews only read; anything that writes (`db:migrate`, `db:import --apply`) changes the live site:

- CI uses a made-up fixture (`npm run db:ci-fixture`, `web/scripts/ci-fixture.ts`); it refuses any database but a local one, and production never holds it.
- `db:import` refuses `--apply` on this endpoint unless `--yes-production` is passed (it compares the target with the integration's `PGHOST`).
- Before a write, back up with `pg_dump -Fc` to `~/.conaulicy-secret/backups/`, with a client matching Neon's major version (Postgres 18: Homebrew `libpq`, `/opt/homebrew/opt/libpq/bin/pg_dump`). Neon's free plan also keeps 6 hours of restore history.

Don't use `vercel env run` (Vercel CLI 64.5): it hands the command back to its own parser, so `vercel env run -e production -- node -e …` started a `vercel deploy` of the working tree (rejected only by luck). Use `web/.env.local` instead.

## Schema changes

Migrations only add what the code about to be deployed needs, and run before that deploy:

```sh
cd web
npm run db:migrate      # reads web/.env.local (Neon main)
```

## Testing data changes without touching production

Use a throwaway local Postgres (Docker `postgres:17`) with `DATABASE_URL` and `DATABASE_URL_UNPOOLED` pointing at it, then `db:migrate`, `db:ci-fixture` and `db:import`, exactly as CI does (`scripts/check-import.mjs`).

## If a separate preview database is wanted later

Create a child branch of `main` in the Neon Console (Vercel → Storage → conaulicy → Open in Neon → Branches), give Preview its own sensitive `DATABASE_URL` / `DATABASE_URL_UNPOOLED`, and scope the integration to Production + Development. "Reset from parent" in the Neon Console then refreshes it from `main`.
