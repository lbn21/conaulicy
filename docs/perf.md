# Performance budgets

`web/scripts/check-perf.mjs` runs in CI on every pull request (step "Performance (Lighthouse budgets)"), against the built app with the throwaway Postgres and the seed, like the other checks. Run it locally with `npm run check:perf` (build included) or `node scripts/check-perf.mjs` after `next build`. `PERF_OUT=file.json` saves the numbers.

## Profile

Lighthouse (npm `lighthouse`, free, no Lighthouse CI server) with its mobile defaults:

- Moto G Power screen, mobile user agent.
- Simulated Slow 4G: 150 ms RTT, 1.6 Mbps down (Lantern simulation, not real throttling).
- CPU slowed 4× (Lighthouse's default, meant to turn a high-end desktop into a mid-tier phone). Fixed, so numbers stay comparable with the baseline.
- Pages: `/`, `/adres/0972447-00470` (seed street, Asnyka), `/dostepnosc`.
- 5 runs per page (`PERF_RUNS`).

## Budgets

| Metric | Budget | Judged on |
|---|---|---|
| LCP | ≤ 1800 ms | best of 5 runs |
| TBT | ≤ 150 ms | median |
| CLS | < 0.01 (in practice 0) | median |
| Street page HTML | ≤ 30 KB gzip | one fetch (all pages are checked) |
| Preloaded fonts | ≤ 4 files | the page's `<link rel="preload" as="font">` |
| Search keystroke → list updated | ≤ 50 ms | median of 5 keys, index loaded, CPU 4× slower |
| First-load JS | ≤ 150 KB gzip | `npm run budget` (separate step) |

## Why LCP takes the best run

Lantern estimates LCP from the trace of a real, unthrottled load. A network request counts towards LCP only if it finished before the LCP paint in that trace. On a local server everything happens within ~50 ms, so whether the 140 KB of JS finished before the first paint is a coin toss. The runs land in two modes, near 1.6 s (JS not counted, which matches a real phone, where the text paints long before the JS arrives) and near 2.2 s (JS counted). The median flipped between them from run to run. The best run is the estimate without that artifact. Heavier fonts, CSS or HTML still push every run up, and JS size has its own budget.

## Known flake

Best-of-5 for LCP still fails now and then in CI, on any of the three pages, when all five runs land in the slow mode (seen on PRs #16 and #17).

The two modes come from request timing in the unthrottled trace that Lantern simulates from: in a given load the JS either finished before the first paint (slow mode, ~2.2 s) or not (fast mode, ~1.6 s). Nothing in the page decides it; the local server is just too fast for the order to be stable.

Calibrating the CPU slowdown does not help (tried 2026-10-19 in PR #18, then dropped). Following Lighthouse's throttling docs, the check set `cpuSlowdownMultiplier` from the machine's `benchmarkIndex` with the Lighthouse CPU throttling calculator's formula:

- CI runner: benchmarkIndex 2385 → 7.66×. LCP stayed bimodal (per page, runs near 1.6 s and near 2.4 s; e.g. `/`: 1602, 2406, 2405, 2391, 1623), and TBT rose to 246–315 ms (over budget; ~90 ms at 4×).
- M-series Mac: benchmarkIndex 4354 → 16.11×, TBT 77–89 ms.

The multiplier does not touch which requests finished before the paint, and benchmarkIndex (a single-thread JS benchmark) did not predict TBT across the two machines.

Options, not implemented (Jakub decides):

- Lighthouse DevTools throttling: measure a really throttled load instead of simulating from a fast one. The numbers differ from the baseline, so the budgets need new values.
- A realistic delay on the local server's responses, so the trace's request order looks like a phone on 4G.

Until then, rerun the failed job when only LCP lands in the slow mode.

## Results

Baseline on production (2026-10-19, gated, before the font and LCP fixes; 3 runs, median, default 4×): `/` LCP 1886 ms, street 1807 ms, `/dostepnosc` 1805 ms; TBT 5–23 ms; CLS 0; 4 fonts (~40 KB).

CI, task 17 (default 4×, median of 5):

| Page | LCP before | LCP after | TBT after |
|---|---|---|---|
| `/` | 2286 ms | 1672 ms | 98 ms |
| Street | 2296 ms | 1584 ms | 91 ms |
| `/dostepnosc` | 2269 ms | 1677 ms | 86 ms |

The fix: fonts subset to Latin + Latin Extended-A, one file per weight (2 files, ~25 KB, was 4 / ~40 KB; `web/scripts/subset-fonts.sh`), and no fade-in on the next pickup (it hid the LCP element for 200 ms).

## Not used

Vercel Speed Insights is not enabled (field data, possibly paid on our plan; not checked). Turn it on only after confirming it is free.
