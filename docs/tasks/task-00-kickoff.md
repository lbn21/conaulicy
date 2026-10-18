# Task 00: Kickoff, decisions that override the plan (read FIRST)

Owner: Grok (main agent). Project: conaulicy.pl ("Mój adres"). Approved by Jakub on 18 Oct 2026.
Docs in this repo: `docs/MVP-PLAN.md`, `docs/tasks/task-10/11/12`, data samples in `docs/data/`.
Note: the plan and tasks were written for repo `lbn21/gdzie-zamieszkac` + Astro. **The decisions below override them.**

## Decisions (binding)
0. **Guiding principle (Jakub): modern, clever, clean, minimalistic, simple. NO over-engineering.** Prefer the fewest moving parts: static pages + CDN cache + one tiny API route. No database, no state library, no CMS, no microservices, no extra abstractions "for later". If something isn't needed for the MVP, leave it out and note it in the backlog. The same applies to the design: few elements, lots of whitespace, one accent colour.
0a. **Scope of the first release: WASTE PICKUPS ONLY** (street → next pickups → add to calendar via ICS). IMGW warnings, water/power outages and email move to the next release. Keep the `/api/warnings` design below in the docs as the plan for that release, but don't build it now.
0b. **Usable for young AND older residents:** body text ≥ 18 px, high contrast (AA minimum, aim AAA for body text), tap targets ≥ 48 px, plain everyday Polish words, no gesture-only interactions, no tiny icons without labels, works with 200% browser text zoom and the OS large-text setting, clear focus states. Test at 360 px with large text.
0c. **Built to grow:** features get added over time from the backlog, so keep the structure simple and easy to extend (one data folder per gmina/source), but build nothing for the future now.
1. **Repo** `lbn21/conaulicy` (private), local `~/projects/conaulicy`. Layout: `web/` (Next.js app), `etl/` (Python ETL from task-10), `docs/`. Update all paths in the docs (`moj-adres/web` → `web/`, `lokalna/data` → `docs/data` or `etl/data`).
2. **Stack: Next.js (latest stable, App Router, TypeScript) on Vercel**, replacing Astro everywhere. Vercel team `gdzie-zamieszkac` (ALWAYS `--scope gdzie-zamieszkac`), project name `conaulicy`, functions region **fra1**.
3. **Domain** `conaulicy.pl` (DNS in Route 53 zone Z038133013GA1DDSHXFPJ, NS propagation in progress). `www` → apex redirect. Until launch: Basic Auth + `noindex` + robots disallow (task-12).
4. **Performance and resilience architecture (Jakub: "caching, clever architecture, works well from PL, no DDoS"):**
   - Street/village pages and sector data are **pre-rendered at build** (SSG via `generateStaticParams`) from ETL JSON. No database, no per-request compute for core pages.
   - **Street search runs client-side** over a small static index JSON (fuzzy, Polish diacritics-insensitive). No search API, so there's nothing to hammer.
   - **ICS feeds** are static (`force-static` route handlers or files), `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`, `text/calendar; charset=utf-8`.
   - **IMGW warnings**: ONE route handler `/api/warnings` that fetches IMGW server-side with ISR/`revalidate = 600` and `s-maxage=600, stale-while-revalidate=3600`, so at most ~1 upstream call per 10 min regardless of traffic. On upstream failure, serve last good data with `stale: true`. This replaces the GitHub Actions 1-minute/10-minute warnings cron from task-10/12 (saves Actions minutes and redeploys). Keep the IMGW attribution sentence.
   - Hashed static assets `immutable`; zero third-party requests (CSP `default-src 'self'`); self-hosted fonts.
   - **Vercel Firewall:** rely on the built-in platform DDoS mitigation; add a WAF **rate-limit rule on `/api/*`** (e.g. 60 req/min per IP; document the value); document how to toggle **Attack Challenge Mode** in an emergency. **Do not enable anything paid without asking**; if a feature needs a paid add-on, report it instead.
   - **Spend protection:** report the current Vercel Spend Management setting for the team (read-only) and recommend a cap. Changing billing settings is Jakub's call.
   - Budget: Lighthouse mobile ≥ 95 performance, LCP < 1.5 s on simulated 4G, JS for the main page ≤ 70 KB gzip.
5a. **UI ownership (Jakub, binding): Opus 5.5 decides EVERY UI element and writes the HTML and the whole UI** (layout, components, styles, copy placement, states, motion). If Opus delegates any UI work to Grok, it must give exact instructions, and Grok implements them literally. Grok never makes or changes a UI decision on its own; Grok owns data, ETL, routing, caching, infra and tests.
5. **Models:** you (Grok 4.7) do everything except UI. **All UI work (design ideas and UI code) goes to a subagent on Opus 5.5 medium.** Opus is expensive, so give it a tight, self-contained prompt: only the needed files and specs, no exploration of the whole repo, a concrete deliverable, and a stop point.
6. Never touch anything outside this project (no Polymarket, no `tynki-baryza`, no other Vercel teams or Route 53 zones). Never buy anything. Paid or destructive commands need Jakub's approval via the Tech Lead.
7. **Styling: Tailwind CSS (latest stable)** (Jakub, 18 Oct). Opus decides how it is used. Scaffold `web/` with create-next-app `--tailwind`; if `web/` already exists, add Tailwind to it.
8. **Mobile-first** (Jakub, 18 Oct): design for 360 px phones first, then adapt to larger screens. Include this in the Opus prompt.
9. **Latest STABLE versions of everything** (Jakub, 18 Oct): Next.js, React, Tailwind, TypeScript, Node (pin the Vercel project Node.js version to the latest supported major) and all dependencies. No canary/beta/rc. List exact versions in the report.
10. **Biome (latest stable) for formatting + linting** (Jakub, 18 Oct), no ESLint, no Prettier at all. create-next-app: pick the Biome option if offered, else skip ESLint and add Biome. `biome.json` + npm scripts `lint` / `format`; CI check later.

## What to do now (in order, then STOP and report)
A. Update `docs/MVP-PLAN.md` and tasks 10/11/12 to reflect decisions 1–5 (concise edits, keep a short "Changelog" at the top of each file).
B. Initial commit on `main`: docs only + `.gitignore` (exclude `docs/data/raw/` if > 5 MB total, `.env*`, `node_modules`, `.vercel`), push to origin.
C. **Task-11 Step 1 via the Opus 5.5 medium subagent:** 2–3 palette + font proposals exactly as specified in task-11 Step 1 (dark + light, AA contrast tables, OFL self-hostable font with Polish pangram, one static preview page per direction, 360 px and 1280 px screenshots in both themes). Output in `design/proposals/` on branch `design/step1-proposals`, push, open a draft PR. Do NOT start Step 2.
D. Write a report to `docs/reports/00-kickoff.md`: what changed, PR link, screenshot paths, open questions, and anything that needs Jakub (money, deletions, third parties).
