# Database branches

One Neon project (Vercel Marketplace, free plan, fra1), two branches:

| Environment | Neon branch | Env vars |
|---|---|---|
| Production | `main` | from the Vercel–Neon integration (scoped to Production + Development) |
| Development (`vercel env pull`, `vercel env run -e development`) | `main` | same integration vars |
| Preview (every non-`main` git branch) | `preview`, child of `main` | manual, sensitive `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct), Preview only |
| CI (GitHub Actions) | none: throwaway `postgres:17` service, migrated and seeded per run | in `.github/workflows/ci.yml`, no secrets |

Vercel "Preview Branching" (one Neon branch per deployment) stays off: the free plan allows 10 branches.

Development points at `main`, the production data, so run writes (`db:migrate`, `db:seed`, imports) with `vercel env run -e preview` first and only then with `-e production`.

## Schema changes

```sh
cd web
vercel env run -e preview --scope gdzie-zamieszkac -- npm run db:migrate      # check a preview deployment
vercel env run -e production --scope gdzie-zamieszkac -- npm run db:migrate
```

## Reset preview from its parent

This makes `preview` an exact copy of `main` again (schema and data). Whatever was only on `preview` is lost. Connection strings stay the same, so the Vercel env vars need no change.

Neon Console (Vercel → Storage → conaulicy → Open in Neon) → Branches → `preview` → **Reset from parent** → confirm. See [Reset from parent](https://neon.com/docs/guides/reset-from-parent).

Then, to show test data again instead of production data:

```sh
cd web
vercel env run -e preview --scope gdzie-zamieszkac -- npm run db:seed
```

Cached pages on preview deployments refresh within an hour, or redeploy the preview.
