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
| CLS | reported, not a gate (≤ 0.1 in the checks) | median |
| Street page HTML | ≤ 30 KB gzip | one fetch (all pages are checked) |
| Preloaded fonts | ≤ 4 files | the page's `<link rel="preload" as="font">` |
| Search keystroke → list updated | ≤ 50 ms | median of 5 keys, index loaded, CPU 4× slower |
| First-load JS | ≤ 200 KB gzip | `npm run budget` (separate step) |
| Street PDF | ≤ 150 KB, 2–6 pages | `scripts/check-pdf.mjs` (separate step): CI fixture's city street, village and split street with `?nr=` |

**Hard gates:** LCP, TBT and the search keystroke are what people feel. CLS left the hard gates (Jakub's decision, 31 Oct 2026): live blocks reveal after the static shell (`docs/layout.md`), and a little shift on reveal is accepted. It is still reported; `check-fonts` and `check-search` hold a reveal to web.dev's "good" CLS (0.1), and a late font must still move nothing (< 0.001). They never move to make room for code; if one fails, report to Jakub.

**Adaptable:** the size budgets (first-load JS, HTML, fonts, PDF) follow GOV.UK Frontend's CSS and JS and alphagov accessible-autocomplete, which are used as-is. Since task 227 accessible-autocomplete (its React build, about 16 KB gzip) is part of the home page's first-load JS, rendered on the server and hydrated, instead of a chunk loaded once the page is idle: the field is the same element before and after hydration.

## Navigation and prefetch costs

The site's own links are `next/link` (task 228, `docs/layout.md`, Navigation): a click fetches the next page's React Server Components payload, not a new document, and Next.js prefetches links as they come into view, with its defaults.

- **Prefetch: static, no function.** With Partial Prefetching (`partialPrefetching: true`, `next.config.ts`) a link prefetches its route's App Shell, the part of the route that depends on no URL: the layout, the static frame and the live blocks' skeletons, never a live block (nextjs.org/docs/app/guides/prefetching, "Partial Prefetching"; nextjs.org/docs/app/guides/adopting-partial-prefetching). One shell per route, shared by every link to it: `/ulice`'s hundreds of links to `/adres/<id>` fetch one, so no `prefetch={false}` or hover-only prefetch is needed (the docs' answer for "too many prefetches" when each link prefetches on its own). `ensureStatic = "prefetch"` on the root layout requires every shell and per-link prefetch to come from static output (nextjs.org/docs/app/api-reference/file-conventions/route-segment-config/ensureStatic), served from the cache, never a server render: "On pages where all the content is statically renderable, Next.js serves prefetches from the static cache (or a CDN)" (nextjs.org/docs/app/api-reference/file-conventions/route-segment-config/prefetch). A shell stays in the browser for its `stale` time (cacheLife `max`: 5 minutes, nextjs.org/docs/app/api-reference/functions/cacheLife#client-cache-behavior), then is fetched again when a link to it is seen. Worst case: the site has 8 page routes (`/`, `/ulice`, `/dostepnosc`, `/prywatnosc`, `/o-projekcie`, `/adres/[id]`, `/adres/[id]/[module]`, and the `/nr/…` variants), so a visitor fetches at most one static shell per route per 5 minutes: bandwidth, no function invocation.
- **Navigation: one function invocation, as a full load.** Every page has a live block (the IMGW line, or the address pages' blocks), read per request (`docs/layout.md`, Live blocks). A link's navigation fetches the page: its static part from the prerender, each live block rendered on the server, so one invocation per click, the same as the full load it replaces (PPR serves the static shell and renders the holes per request either way; nextjs.org/docs/app/getting-started/caching). Pages are never cached in the browser (`staleTimes.dynamic` 0 s, nextjs.org/docs/app/api-reference/config/next-config-js/staleTimes), so no navigation skips it. Worst case: invocations = page views, as before task 228; Back and Forward reuse the page as it was left, with none.
- **JS:** `next/link` is part of Next.js's client runtime, already in every page's first-load JS (the search's `useRouter().push` used the same router); `npm run budget` checks the 200 KB.

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
