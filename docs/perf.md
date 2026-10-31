# Performance budgets

`web/scripts/check-perf.mjs` (Lighthouse) is a **manual check**, not part of pull request CI (task 75c): run it before bigger UI changes (layout, fonts, scripts, the search). On GitHub: `gh workflow run ci.yml --ref <branch>` (or Actions → CI → Run workflow) runs only the `perf` job, step "Performance (Lighthouse budgets)", against its own build of the app with its own throwaway Postgres and the CI fixture. `PERF_OUT=file.json` saves the numbers. The deterministic checks stay in every PR's CI: First-load JS budget and Fonts (no layout shift).

## Profile

Lighthouse (npm `lighthouse`, free, no Lighthouse CI server) with its mobile settings and **real throttling** (`throttlingMethod: "devtools"`):

- Moto G Power screen, mobile user agent: set explicitly to a phone's Chrome (`BROWSER_UA`, `web/scripts/lib/server.mjs`), never a bot's, so the budgets measure what visitors get. Next.js renders a page per request for the user agents on its HTML-limited bot list (`Chrome-Lighthouse` among them), skipping the prerendered shell (https://nextjs.org/docs/app/guides/streaming#cache-components). Lighthouse 13.5's own mobile user agent no longer carries that token; the setting keeps it so.
- Slow 4G (150 ms RTT, 1.6 Mbps down), applied by Chrome with Lighthouse's devtools adjustment: 562.5 ms request latency (150 × 3.75), 1475 kbps down (× 0.9), 675 kbps up. The check prints the profile it used.
- CPU slowed 4× (Lighthouse's default). Fixed, not calibrated (see "Flake fixed" below). Each run's `benchmarkIndex` and the CPU slowdown are logged per page for information only; calibrating with Lighthouse's official CPU throttling calculator was not adopted, because on CI runners it would raise the slowdown above 4×.
- Pages: `/`, `/adres/0972447-00470` (CI fixture street, Asnyka: the address page), `/adres/0972447-00470/smieci` (its waste subpage, the former street page), `/dostepnosc`, `/ulice` (every place, from the CI fixture).
- 5 runs per page (`PERF_RUNS`).

## Budgets

| Metric | Budget | Judged on |
|---|---|---|
| LCP | ≤ 1800 ms | median |
| TBT | ≤ 150 ms | median |
| CLS | < 0.01 (in practice 0) | median |
| Street page HTML | ≤ 30 KB gzip | one fetch (all pages are checked) |
| Preloaded fonts | ≤ 4 files | the page's `<link rel="preload" as="font">` |
| Search keystroke → list updated | ≤ 50 ms | median of 5 keys, index loaded, CPU 4× slower |
| First-load JS | ≤ 200 KB gzip | `npm run budget` (separate step) |
| Street PDF | ≤ 150 KB, 2–6 pages | `scripts/check-pdf.mjs` (separate step): CI fixture's city street, village and split street with `?nr=` |

**Hard gates:** LCP, TBT, CLS and the search keystroke are what people feel. They never move to make room for code; if one fails, report to Jakub.

**Adaptable:** the size budgets (first-load JS, HTML, fonts, PDF) follow GOV.UK Frontend's CSS and JS and alphagov accessible-autocomplete, which are used as-is.

## Flake fixed: real throttling (2026-10-19)

Until PR #20 the check used Lantern, Lighthouse's default simulated throttling. Lantern estimates a slow load from the trace of an unthrottled one, and counts a request towards LCP only if it finished before the LCP paint in that trace. On the local server everything finishes within ~50 ms, so whether the 140 KB of JS counted was a coin toss: runs landed near 1.6 s or near 2.2 s, and even the best of 5 runs failed now and then (PRs #16, #17, #19). Calibrating the CPU slowdown from `benchmarkIndex` did not help (CI runner 2385 → 7.66×: still bimodal, TBT 246–315 ms; dropped).

With real throttling the page really loads over the slowed network and CPU, so the order of requests is the same as on a phone. Five CI runs of the check (5 Lighthouse runs per page each, 75 runs):

| Page | LCP, all runs | LCP medians of the 5 CI runs | TBT medians of the 5 CI runs |
|---|---|---|---|
| `/` | 1360–1438 ms | 1397, 1394, 1409, 1383, 1417 | 76, 132, 124, 45, 115 |
| Street | 1373–1477 ms | 1417, 1416, 1405, 1390, 1408 | 77, 139, 120, 43, 117 |
| `/dostepnosc` | 1378–1437 ms | 1389, 1397, 1391, 1385, 1401 | 78, 129, 134, 43, 115 |

- LCP has one mode, equal to FCP (the text paints with the fallback font as soon as the HTML and CSS arrive). The 1.8 s budget stays, ~320 ms above the worst run.
- LCP is judged on the **median** again. Within one CI run the five values lie within ~80 ms, so there is no artifact for the best run to hide, and the median also catches a regression that only some runs would show.
- TBT is steady within a CI run but differs between runners (medians 43–139 ms): real CPU throttling slows the runner's own CPU 4×, and runners differ. The 150 ms budget is unchanged. A slow runner can push one run over it; if a re-run fails too, treat it as a regression.
- Locally (M-series Mac) the same check gives LCP ~1340 ms and TBT 0–13 ms.
- A run takes about 4 minutes in CI instead of 2.

## Results

Baseline on production (2026-10-19, gated, before the font and LCP fixes; 3 runs, median, default 4×): `/` LCP 1886 ms, street 1807 ms, `/dostepnosc` 1805 ms; TBT 5–23 ms; CLS 0; 4 fonts (~40 KB).

CI, task 17 (simulated throttling, default 4×, median of 5):

| Page | LCP before | LCP after | TBT after |
|---|---|---|---|
| `/` | 2286 ms | 1672 ms | 98 ms |
| Street | 2296 ms | 1584 ms | 91 ms |
| `/dostepnosc` | 2269 ms | 1677 ms | 86 ms |

The fix: fonts subset to Latin + Latin Extended-A, one file per weight (2 files, ~25 KB, was 4 / ~40 KB; `web/scripts/subset-fonts.sh`), and no fade-in on the next pickup (it hid the LCP element for 200 ms).

## Not used

Vercel Speed Insights is not enabled (field data, possibly paid on our plan; not checked). Turn it on only after confirming it is free.
