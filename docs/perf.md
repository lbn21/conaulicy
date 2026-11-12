# Performance budgets

`web/scripts/check-perf.mjs` (Lighthouse) is a **manual check**, not part of CI: run it by hand before bigger UI changes (layout, fonts, scripts, the search), `npm run check:perf` against a build on the CI fixture (`npm run db:local`). `PERF_OUT=file.json` saves the numbers. Only the First-load JS budget stays in every PR's CI.

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
| Street PDF | ≤ 150 KB, exactly 2 pages | `scripts/check-pdf.mjs` (separate step): every CI fixture address, the synthetic worst case included |

**Hard gates:** LCP, TBT and the search keystroke are what people feel. CLS is not a hard gate: live blocks reveal after the static shell (`docs/layout.md`), and a little shift on reveal is accepted (held to ≤ 0.1). It is reported by `check-perf`. They never move to make room for code; if one fails, report to Jakub.

**Adaptable:** the size budgets (first-load JS, HTML, fonts, PDF) follow GOV.UK Frontend's CSS and JS and alphagov accessible-autocomplete, which are used as-is. accessible-autocomplete (its React build, about 16 KB gzip) is part of the home page's first-load JS, rendered on the server and hydrated: the field is the same element before and after hydration.

## Navigation and prefetch costs

The site's own links are `next/link` (`docs/layout.md`, Navigation): a click fetches the next page's React Server Components payload, not a new document, and Next.js prefetches links as they come into view, with its defaults.

- **Prefetch: static, no function.** With Partial Prefetching (`partialPrefetching: true`, `next.config.ts`) a link prefetches its route's App Shell, the part of the route that depends on no URL: the layout, the static frame and the live blocks' skeletons, never a live block (nextjs.org/docs/app/guides/prefetching, "Partial Prefetching"; nextjs.org/docs/app/guides/adopting-partial-prefetching). One shell per route, shared by every link to it. Links to an address page prefetch their route's shell too (`docs/layout.md`, Navigation): the address routes linked are at most 3 (`/adres/[id]`, `/adres/[id]/smieci` and `/adres/[id]/[module]`; a `?nr=` is read from `searchParams` on the same route), so `/ulice`'s 336 links prefetch one shell, not 336. A link to an address page also prefetches the place's own static content once someone points at it, focuses it or touches it, never before (`docs/layout.md`): about 3 requests, 9 KB, per such link, all static (prerendered, CDN hits, no function). `ensureStatic = "prefetch"` on the root layout requires every shell and per-link prefetch to come from static output (nextjs.org/docs/app/api-reference/file-conventions/route-segment-config/ensureStatic), served from the cache, never a server render: "On pages where all the content is statically renderable, Next.js serves prefetches from the static cache (or a CDN)" (nextjs.org/docs/app/api-reference/file-conventions/route-segment-config/prefetch). A shell stays in the browser for its `stale` time (cacheLife `max`: 5 minutes, nextjs.org/docs/app/api-reference/functions/cacheLife#client-cache-behavior), then is fetched again when a link to it is seen. Worst case: the site's prefetched page routes are at most 8 (`/`, `/ulice`, `/dostepnosc`, `/prywatnosc`, `/o-projekcie` and the 3 address routes), so a visitor fetches at most 8 static shells per 5 minutes: bandwidth, no function invocation.
- **Navigation: one function invocation, as a full load.** The address pages have a live block, the whole page, read per request (`docs/layout.md`, Live blocks). A link's navigation fetches the page: its static part from the prerender, each live block rendered on the server, so one invocation per click, the same as the full load it replaces (PPR serves the static shell and renders the holes per request either way; nextjs.org/docs/app/getting-started/caching). Pages are never cached in the browser (`staleTimes.dynamic` 0 s, nextjs.org/docs/app/api-reference/config/next-config-js/staleTimes), so no navigation skips it. Worst case: invocations = page views; Back and Forward reuse the page as it was left, with none.
- **JS:** `next/link` is part of Next.js's client runtime, already in every page's first-load JS (the search's `useRouter().push` used the same router); `npm run budget` checks the 200 KB.

## Method: real throttling

The check uses real throttling, not Lighthouse's default simulated throttling (Lantern). Lantern estimates a slow load from the trace of an unthrottled one; on a local server everything finishes within ~50 ms, so whether the JS counted towards LCP was a coin toss and runs were bimodal. With real throttling the page really loads over the slowed network and CPU, so the order of requests is the same as on a phone.

- LCP has one mode, equal to FCP (the text paints with the fallback font as soon as the HTML and CSS arrive), and is judged on the **median**: within one run the values lie within ~80 ms, and the median also catches a regression that only some runs would show.
- TBT is steady within a run but differs between machines: real CPU throttling slows the machine's own CPU 4×. A slow machine can push one run over the budget; if a re-run fails too, treat it as a regression.
- Fonts are subset to Latin + Latin Extended-A, one file per weight (2 files, ~25 KB; `web/scripts/subset-fonts.sh`), and the LCP element has no fade-in.

## Not used

Vercel Speed Insights is not enabled (field data, possibly paid on our plan; not checked). Turn it on only after confirming it is free.
