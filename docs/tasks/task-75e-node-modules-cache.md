# Task 75e: cache web/node_modules in CI

Approved by Jakub, 23 Oct 2026.

## Why

- Every `web` run does `npm ci` (about 10 s with a warm npm cache, more without). With an unchanged lockfile, the result is the same every time.

## Do (only `.github/workflows/ci.yml`)

1. In `web` and `perf`: restore `web/node_modules` with `actions/cache/restore` (same pinned SHA as the existing `actions/cache` uses).
2. Exact key: runner OS, arch, runner image version (`$ImageOS-$ImageVersion`), the exact Node version from setup-node, and `hashFiles('web/package-lock.json')`. No `restore-keys`: a partial or stale `node_modules` is never used.
3. `npm ci` only on a miss, then `actions/cache/save` straight away, so the cache holds exactly what `npm ci` produced, before any later step can write into it.
4. Drop setup-node's `cache: npm`: it also misses on a PR's first run, and on later runs `node_modules` hits, so it only adds a restore and a save.
5. Nothing else changes: Java before Node, Playwright and poppler caches, steps, perf trigger.

## Checked

- Packages with install scripts: `vnu-jar` (postinstall downloads a JRE into `node_modules/.cache` only if there is no Java 11+ on PATH; `vnu.jar` itself ships in the package), `esbuild` ×3 (postinstall checks its binary inside `node_modules`), `@parcel/watcher` (builds only with `npm_config_build_from_source`), `fsevents` (macOS only). All write only inside `node_modules`, so a hit restores everything they produce. `check-html.mjs` runs `java` from setup-java itself.
- Java stays before `npm ci`, so on a miss vnu-jar still finds Java and downloads nothing.

## Prove it

Open a PR (do not merge). First run: a miss, `npm ci` runs, the cache is saved. Second run on the same head: a hit, `npm ci` skipped. Report both `web` durations and the step timings.
