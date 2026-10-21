# conaulicy.pl – web

The Next.js app for conaulicy.pl (street → next waste pickups → calendar), plus its scripts: the unattended import (`scripts/import/`), the one-off importer and the CI checks. Rules and design system: [../CLAUDE.md](../CLAUDE.md).

```sh
npm ci
npm run dev        # needs DATABASE_URL
```

`web/.env.local` (from `vercel env pull`) points at the production database. For local work use a throwaway Postgres with the CI fixture (`npm run db:migrate && npm run db:ci-fixture`), as described in [../docs/database.md](../docs/database.md).

Checks: `npx biome check`, `npm test`, `npm run config:check`, `npm run build`, and the `check:*` scripts in `package.json` (CI runs them all, `.github/workflows/ci.yml`). The import: [../docs/import.md](../docs/import.md). Performance budgets: [../docs/perf.md](../docs/perf.md).
