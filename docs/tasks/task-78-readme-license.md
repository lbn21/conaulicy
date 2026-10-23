# Task 78: Polish README, LICENSE (AGPL-3.0) and .env.example

Requested by Jakub, 23 Oct 2026. One small PR, not merged by the agent.

## Why

The repository has no README at its root, no licence and no list of the environment variables the code reads. A visitor cannot tell what the project is, how to run it or on what terms the code may be reused.

## Do

1. **`README.md`** (root, new; the repo has none, `web/README.md` stays as is): short, warm, plain Polish. What conaulicy.pl is (free, non-profit, Lubaczów town and gmina: street → next waste pickups → calendar (ICS) → PDF), https://conaulicy.pl, problems reported only by email to kontakt@conaulicy.pl (not GitHub issues), the stack from `web/package.json`, running locally against a throwaway Postgres (`web/.env.example`, `docs/database.md`, `web/README.md`), never production, and a licence section: code AGPL-3.0-or-later; gmina data and source files, Atkinson Hyperlegible Next (OFL), govuk-frontend (MIT) and TERYT (GUS) keep their own terms.
   - No other projects or resources of the owner, no personal data or addresses, no AWS or Vercel team internals.
2. **`LICENSE`**: the official AGPL-3.0 text, downloaded verbatim from https://www.gnu.org/licenses/agpl-3.0.txt. SPDX id `AGPL-3.0-or-later`. A `license` field in `web/package.json` only if it causes no lockfile change.
3. **`web/.env.example`** (the app and its scripts read env from `web/`, `.env.local`): variable names only, a one-line comment each, no values. Gathered by grepping `process.env` and env-object access in `web/`, `etl/` and `.github/workflows/`. Variables set by the platform (Vercel, GitHub Actions, the OS) are left out. Add `!.env.example` to both `.gitignore` files.
4. Cheap local checks only (Biome on changed files). No database commands, no `next build`, `dev` or `start`.

## Don't

- No site code changes and no drive-by changes. The site keeps having no links to the repository.
- Don't merge.
