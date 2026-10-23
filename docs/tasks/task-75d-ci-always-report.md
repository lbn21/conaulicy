# Task 75d: CI reports on every PR

Approved by Jakub, 23 Oct 2026.

## Why

- `ci.yml`'s `pull_request` trigger has a `paths:` filter, so a PR that changes only Markdown or `etl/review/**` never runs CI.
- `web` is a required status check (ruleset `main-protection`). On those PRs it never reports, so they cannot merge without a bypass.
- Cost of running it always: about 3 min of CI on doc PRs. The repo is public, so the minutes are free.

## Do (only `.github/workflows/ci.yml`)

1. Remove the `paths:` filter (and its comment) from the `pull_request` trigger, so `web` always runs and reports.
2. No `push` trigger exists, so nothing to change there.
3. No skip logic, no dummy jobs. `workflow_dispatch` and the `perf` job stay as they are.

## Prove it

Open a PR (do not merge), green CI. This PR changes a workflow and a Markdown brief, and `web` reports on it.
