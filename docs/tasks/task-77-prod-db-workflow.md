# Task 77: production database workflow

Requested by Jakub, 23 Oct 2026. One PR, not merged by the agent. It adds only `.github/workflows/prod-db.yml` and this brief; the code guard and the `CLAUDE.md` / `docs/database.md` rule changes are separate, later PRs. (The number 77 was also used by PR #100, the docs cleanup.)

## Goal

Production migrations and imports never run from a laptop. They run only through a manually started GitHub workflow, in the GitHub environment `production` (Jakub as required reviewer), after an automatic backup.

## What it can run

`web/package.json` and `docs/database.md` list three commands that write to production: `db:migrate`, `db:import --apply` and `db:redirect --apply`. The workflow offers, as a fixed `task` choice (no free-text input):

- `backup-only`: the backup and the retention, nothing else. Use it for the first run, to check the environment, secrets and Neon API without touching the database.
- `migrate`: backup, then `npm run db:migrate` (drizzle-kit; it has no dry run).

Left out, on purpose:

- `db:import` (the one-off importer, `web/scripts/import.ts`) needs `--from <etl out>`, the ETL output in `etl/out/`, which is gitignored and not archived in S3 (`docs/data/sources.md` lists only raw sources). A runner has nothing to import. Adding it, with its dry run, needs that output reachable from CI first: a separate task.
- `db:redirect` needs an old id, a new id and a reason: free text. It could later take inputs checked against a strict pattern; not here.
- The unattended import (`import:run`) already has its own workflow, `import.yml`, with its own restricted role (`IMPORT_DATABASE_URL`). Unchanged.

## Design

- **Trigger:** `workflow_dispatch` only. The job runs only when `github.ref` is `refs/heads/main`, and the environment's branch rule says the same.
- **Approval:** `environment: production`. Its secrets reach the job only after Jakub approves the run.
- **Permissions:** `contents: read`; checkout without persisted credentials.
- **Concurrency:** group `prod-db`, never cancelled in progress (a half-run migration is worse than a queued one). Timeout 15 minutes.
- **Actions:** checkout and setup-node pinned by full SHA, the same versions and Node setup as `ci.yml`. `npm ci` runs before the backup, so a broken install never leaves a pointless backup.
- **Backup:** plain `curl` and `jq` (both on the runner) against the Neon API v2 ([create branch](https://api-docs.neon.tech/reference/createprojectbranch)). The step finds the project's single default branch, creates `backup-<UTC yyyymmdd-hhmm>-run<run_id>` with it as parent and no compute, and waits for Neon's operations to finish ([get operation](https://api-docs.neon.tech/reference/getprojectoperation)). Any failure fails the job, so the apply step never runs. The POST is never retried, so a retry can never make a second branch. The branch name goes in the run summary.
- **Why curl, not Neon's actions:** the official `neondatabase/create-branch-action` and `delete-branch-action` would each add third-party code to a job that holds the API key, and neither does the list-and-prune retention, which would still need curl. Plain curl with pinned runner tools is less code to trust and is all in this file.
- **Retention:** after the backup, the step lists branches ([list branches](https://api-docs.neon.tech/reference/listprojectbranches)) and keeps the 3 newest `backup-*` branches by `created_at`. It deletes only branches whose name starts with `backup-`, never the default branch, a protected branch or the backup just made. It refuses to delete anything if the new backup is not among the 3 newest, and it logs each deleted name.
- **Apply:** `PROD_DATABASE_URL` is passed only to the apply step, as `DATABASE_URL_UNPOOLED` (what `drizzle.config.ts` reads). Before applying, the step checks that the URL's Neon endpoint belongs to the default branch it just backed up; otherwise it stops. No secret is echoed and there is no `set -x`; steps run as `bash -eo pipefail`.
- **Neon free plan:** 10 branches per project; creating more fails ([plans](https://neon.com/docs/introduction/plans)). With 3 backups kept, the default branch and room for one more during a run, at most 5 are used, which leaves room for others (for example Vercel preview branches, if ever enabled). The free plan's 6-hour restore window still applies on top of this.
- **Restoring:** from a backup branch, per Neon's [branch restore docs](https://neon.com/docs/guides/branch-restore).

## Setup checklist (Jakub)

GitHub, per [Managing environments for deployment](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments). Environments with required reviewers are available because the repository is public.

1. Repository **Settings → Environments → New environment**, named `production`.
2. **Required reviewers:** add yourself.
3. **Prevent self-review:** leave it **off**. You are both the only reviewer and the person who starts the run; with it on, nobody could approve.
4. Untick **Allow administrators to bypass configured protection rules**.
5. **Deployment branches and tags:** **Selected branches and tags**, then add a branch rule `main`.
6. **Environment secrets** (on this environment, not repository secrets):
   - `NEON_API_KEY`: a Neon API key ([API keys docs](https://neon.com/docs/manage/api-keys)). A project-scoped key is limited to this project, but only an organization admin can create one for a project owned by an organization. On a personal account only a personal key exists (profile menu, **Settings → API keys**), and it reaches every project you belong to.
   - `NEON_PROJECT_ID`: the project's ID (Neon Console, project settings).
   - `PROD_DATABASE_URL`: the **direct (unpooled)** connection string of the default branch, owner role (migrations need DDL).
7. Start the first run with `task: backup-only`: **Actions → prod-db → Run workflow** on `main`, approve it, and check the backup branch in the Neon Console.
8. After that first run, rotate the database password, because the old one has been on the laptop (`web/.env.local`): reset the role's password per Neon's [roles docs](https://neon.com/docs/manage/roles), then update `PROD_DATABASE_URL` and the Vercel integration's variables per Neon's [Vercel-managed integration docs](https://neon.com/docs/guides/vercel-managed-integration), and redeploy production. The site uses this connection, so it fails between the reset and the redeploy: do it at a quiet hour. The old password was on the laptop (`web/.env.local`) until 23 Oct 2026 and has since been removed there.

## Acceptance criteria

- The diff is `.github/workflows/prod-db.yml` plus this brief; `import.yml` and `ci.yml` are unchanged.
- actionlint (with shellcheck) reports nothing for `prod-db.yml`.
- The workflow is not run, and no environment, secret or database is touched by the agent.
- Not merged by the agent.
