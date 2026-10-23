# Task 75f: CI cache warm-up on main

## Why

- GitHub Actions caches saved on a PR ref are readable only by that PR; caches saved on `main` are readable by every PR ([restrictions for accessing a cache](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching#restrictions-for-accessing-a-cache)).
- `ci.yml` never runs on `main`, so the Playwright, poppler and setup-node npm caches miss on the first run of every new PR.

## Do (only `.github/workflows/ci.yml`)

1. Add a `push: branches: [main]` trigger next to `pull_request`, with a one-line comment saying why. Keep `workflow_dispatch`.
2. `perf` stays on demand only: its `if: github.event_name == 'workflow_dispatch'` already skips push events. `web` (`!= 'workflow_dispatch'`) runs on push.
3. Concurrency `ci-${{ github.ref }}` stays: a push to main has ref `refs/heads/main`, a PR `refs/pull/<n>/merge`, so they never cancel each other.

## Prove it

1. The diff touches only `ci.yml` (a few lines) and this brief.
2. On push to `main` only `web` runs; `perf` does not.
3. PR CI is green. Do not merge.
