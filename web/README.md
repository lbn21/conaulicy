# conaulicy.pl – web

The Next.js app for conaulicy.pl (street → next waste pickups → calendar), plus its scripts: the unattended import (`scripts/import/`), the one-off importer and the CI checks. Rules and design system: [../CLAUDE.md](../CLAUDE.md).

```sh
npm ci
npm run dev        # needs DATABASE_URL
```

`web/.env.local` (from `vercel env pull`) points at the production database. Local work uses only `npm run db:local` (`docker-compose.yml`: Postgres 18 on 127.0.0.1 with the CI fixture; `db:local:reset`, `db:local:stop`), at `postgres://ci:ci@127.0.0.1:5432/conaulicy`; see [../docs/database.md](../docs/database.md).

Checks: `npx biome check`, `npm test`, `npm run config:check`, `npm run build`, and the `check:*` scripts in `package.json` (CI runs them all, `.github/workflows/ci.yml`). The import: [../docs/import.md](../docs/import.md). Performance budgets: [../docs/perf.md](../docs/perf.md).
