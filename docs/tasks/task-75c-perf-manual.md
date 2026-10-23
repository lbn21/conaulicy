# Task 75c: Lighthouse out of PR CI, on demand

Approved by Jakub, 23 Oct 2026.

## Why

- The `perf` job is CI's critical path: median 443 s, p90 1090 s, against 245 s for `web`.
- It has never caught a real regression. Its 12 failures were all budget calibration or TBT noise, and it is not a required check.
- The deterministic checks (First-load JS budget, Fonts layout shift) stay in the `web` job.

## Do

1. `.github/workflows/ci.yml`: `perf` runs only on `workflow_dispatch`; `web` skips it. Delete the `changes` job (only `perf` used it).
2. Delete `web/scripts/check-perf-retry.mjs` (unused). Keep `check-perf.mjs`.
3. `CLAUDE.md` and `docs/perf.md`: Lighthouse is a manual check, run before bigger UI changes, and how to run it. Budgets unchanged.
4. No schedule trigger (schedules do not fire in this repo).

## Prove it

Open a PR (do not merge), green CI. Dispatch it once on the PR branch: `gh workflow run ci.yml --ref ci/75c-perf-manual`.
