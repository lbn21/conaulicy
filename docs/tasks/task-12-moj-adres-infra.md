# Task 12 — „Mój adres” infra: Next.js on Vercel, source monitor, Basic Auth before the real launch (owner: **Grok**)

## Changelog
- **18.10.2026, task-00 (binding).** Repo `lbn21/conaulicy`. Vercel team `gdzie-zamieszkac` only (`--scope gdzie-zamieszkac` on every command). Project name `conaulicy`, root directory `web`, functions region `fra1`. Framework is Next.js (latest stable, App Router), not Astro.
- Node.js on Vercel is pinned to **24.x**, the newest major Vercel supports for builds and functions (26.x is not available there). All dependencies are latest stable: no canary, beta or rc.
- No IMGW cron. Next release: one route `web/` `GET /api/warnings` with `revalidate = 600` and `Cache-Control: s-maxage=600, stale-while-revalidate=3600`. On failure, last good payload with `stale: true`.
- ICS is static: `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`, `text/calendar; charset=utf-8`.
- Domain `conaulicy.pl` is already chosen. Zone `Z038133013GA1DDSHXFPJ` exists. **Do not touch AWS or Route 53** — the Tech Lead writes DNS. `www` is a permanent **308** to `https://conaulicy.pl`. Apex is primary.
- A noindex hello world may be deployed to production (see `docs/reports/01-hello-world.md`). Basic Auth is still required before real schedule data is public. No paid add-on without asking. Biome `lint` / `format` in CI later; no ESLint, no Prettier.
- UI is Opus 5.5 medium (task-11). ETL is Grok (task-10).

Repo: `lbn21/conaulicy` (private). Branch `feat/infra` for the remaining work below.
**Hard rules:** no purchases, no paid add-ons (do NOT enable Vercel "Password Protection" or Advanced Deployment Protection; use our own Basic Auth below). No secrets in the repo or in logs. Don't contact anyone. Don't touch other Vercel teams or any Route 53 zone.

## 1. Repo structure
```
etl/                     # task-10 (Python 3.12)
  sources.yaml  aliases.yaml  review/approvals.yaml  tests/  Makefile
web/                     # Next.js App Router + Tailwind. Opus owns the UI.
  app/  public/fonts/  copy.pl.md  biome.json  proxy.ts
  package.json           # "engines": { "node": "24.x" }
design/proposals/        # task-11 step 1
docs/
```
`web/proxy.ts` (Next.js 16; the old `middleware.ts` name is deprecated) is where Basic Auth will live. `web/vercel.json` sets `"regions": ["fra1"]`.
Data flow: ETL writes JSON and ICS that `web/` pre-renders (`generateStaticParams`) on a bot branch `data/auto` → PR → human approval (task-10) → merge to `main` → Vercel builds. There is no `warnings.json` commit in this release.

## 2. GitHub Actions (cron in UTC; Poland = UTC+1 winter / UTC+2 summer)
| Workflow | Cron | Does |
|---|---|---|
| `monitor-sources.yml` | `17 5 * * *` (daily) + `17 */2 * * *` in Dec–Jan | discovery queries (WP media/posts APIs, sha256 of known files, page HTML hash); on change → open a GitHub issue „Nowy/zmieniony harmonogram: …” with links + diff; never publish automatically |
| `etl-waste.yml` | `workflow_dispatch` + on push to `etl/**` | full extraction → PR from `data/auto` with review files |
| `ci.yml` | PR | pytest (ETL), `npm run lint` (Biome), Next.js build, Lighthouse CI on the preview (mobile), axe |
There is **no** `etl-warnings.yml`. IMGW is the `/api/warnings` route in the next release, not a cron.
- Scheduled jobs can be delayed or dropped; the monitor must tolerate gaps. Private-repo Actions minutes: estimate the daily monitor plus on-demand ETL and cite the account's real quota. [Do not assume the number.]
- `concurrency:` so two runs never push at once; `permissions:` least privilege.

## 3. Vercel project
- Team `gdzie-zamieszkac`, project `conaulicy`, root directory `web`, framework Next.js, Node **24.x**, region **fra1**. Always `--scope gdzie-zamieszkac`.
- **noindex until launch:** `<meta name="robots" content="noindex, nofollow">`, header `X-Robots-Tag: noindex, nofollow`, `robots.txt` disallows `/`.
- **Basic Auth before real data is public:** `web/proxy.ts` checks `Authorization: Basic` against env `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` (set with `vercel env add … --scope gdzie-zamieszkac`, value never printed); 401 + `WWW-Authenticate: Basic realm="Moj adres"`. The hello world may stay reachable without Basic Auth while it is only a placeholder. Turn Basic Auth on before publishing schedules. Remove it only at launch with Jakub's go.
  - Calendar apps cannot subscribe to ICS behind Basic Auth. Test ICS by file import, or with a token path documented in the README (token in env, not in the repo), and delete that path at launch.
- Headers: `Content-Security-Policy` `default-src 'self'`, `Referrer-Policy: strict-origin-when-cross-origin`, a minimal `Permissions-Policy`. Hashed static assets `immutable`. ICS as in the changelog. No third-party requests; fonts self-hosted.
- **Firewall (document, do not buy):** platform DDoS mitigation is enough for now. When `/api/*` exists, a WAF rate limit of 60 requests/minute per IP — only if that rule is included in the current plan. If it needs a paid add-on, stop and ask. Write down how to enable Attack Challenge Mode; do not enable it now.
- **Spend:** read Spend Management for this team (read-only) and recommend a cap. Jakub changes billing.
- **Analytics:** Vercel Web Analytics (cookieless) — confirm what the plan includes and report; no Google Analytics.
- Further production deploys of the real site need Jakub's go. Preview deploys are fine (`vercel deploy --scope gdzie-zamieszkac`).

## 4. Domain
`conaulicy.pl` is primary. `www.conaulicy.pl` redirects with **308** to `https://conaulicy.pl` (set on the www domain in the Vercel project). DNS is Route 53 zone `Z038133013GA1DDSHXFPJ`. **Do not call AWS and do not change that zone.** The Tech Lead adds the records Vercel reports (apex A/ALIAS, www CNAME). Record the exact values in `docs/reports/`. Indexing stays off until launch.

## 4a. `/api/warnings` (next release — design only, do not build now)
One route handler. Server-side fetch of IMGW, `revalidate = 600`, `s-maxage=600, stale-while-revalidate=3600`, so about one upstream call per 10 minutes. On failure, last good body with `stale: true`. Keep the IMGW attribution sentence from `docs/data/DATA-INVENTORY.md`.

## 5. Email reminders (next release, NOT now)
Design note only: Resend (or similar) with double opt-in, a single list per sector, unsubscribe link, DKIM/SPF in the existing Route 53 zone (Tech Lead applies DNS). Cost: check current limits and prices on resend.com/pricing and write them in the note. No sign-up now.

## Acceptance criteria
- [ ] Repo structure as above; README with "how data flows", "how to approve a schedule", "how to rotate Basic Auth".
- [ ] The three workflows are green on a test run. There is no warnings cron. The monitor opens an issue when a fixture file's sha256 is altered (prove with a dry-run test).
- [ ] Before real schedule data is public, the deployment on team `gdzie-zamieszkac` returns **401 without credentials** and 200 with them. Until then, and after launch, every response has `X-Robots-Tag: noindex, nofollow` until indexing is explicitly turned on; `robots.txt` disallows all.
- [ ] CSP blocks third-party hosts; no request to Google Fonts or any CDN.
- [ ] No secret appears in the repo, Actions logs or Vercel build logs.
- [ ] Cost note: expected $0 beyond the existing Vercel plan (Actions minutes, bandwidth for ~1,000 users, Web Analytics quota). Do not buy a domain or a hosted zone. Email provider is the next release. If a WAF rule needs a paid add-on, stop and ask.
- [ ] `www` 308s to the apex. DNS changes are the Tech Lead's. PR to `main`, do not merge this task's remaining work without review.
