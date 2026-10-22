# Task 62: unknown query parameters redirect to the clean URL (cache safety)

Approved by Jakub, 22 Oct 2026 (production-release PR 5). Branch: `feat/strip-unknown-params` from the current `origin/main` (2d42869 or later).

## Why

conaulicy.pl (Next.js 16 App Router in `web/`) is about to launch **without** a Vercel WAF rate limit. Vercel's CDN keys cached responses on the full URL including the query string, so `/adres/<id>?x=1`, `?x=2`, … each miss the cache and hit the function (and possibly Neon). Random query strings must not bust the cache: any query parameter that a route does not use is dropped with a redirect to the clean URL, which is cached.

## What exists (read these first)

- `web/proxy.ts` — the middleware (Next 16 "proxy"): the Basic Auth gate (active when `SITE_BASIC_AUTH` is set) and `missingNumber()` (a `?nr=` with no usable house number is rewritten to `/adres/<id>/numer`). Its `config.matcher` excludes `_next/static/` and `api/revalidate`.
- `web/next.config.ts` — `rewrites.beforeFiles`: `/adres/:id?nr=<valid>` → `/adres/:id/nr/:nr`; `redirects()`: host `conaulicy.vercel.app` → `https://conaulicy.pl` (runs before the proxy).
- Query parameters actually used today (verify with grep; `rg` is not installed, use `grep -rn`): `nr` on `/adres/<id>` (street page form `method="get"` in `components/place-page.tsx`, search links in `lib/search.ts`) and on `/adres/<id>/harmonogram.pdf` (`route.ts` reads `searchParams.get("nr")`; links carry `?nr=`); `q` on `/api/search` (`components/address-search.tsx` fetches `/api/search?q=…`). No other route reads a query parameter. If you find another one, add it to the allowlist and say so in the PR.

## Change

### Allowlist + redirect, in the proxy (minimal code)
- A small pure helper, e.g. `web/lib/clean-query.ts`: `cleanQuery(pathname, searchParams): string | null` returning the clean search string (e.g. `"?nr=12a"` or `""`) when the URL has any parameter outside the route's allowlist (or duplicates of an allowed one), else `null` (no redirect needed). Allowlist by path:
  - `/adres/<id>` and `/adres/<id>/harmonogram.pdf` → `["nr"]`
  - `/api/search` → `["q"]`
  - everything else handled by the proxy (`/`, `/ulice`, `/dostepnosc`, `/prywatnosc`, `/o-projekcie`, `/adres/<id>/numer`, `/adres/<id>/nr/...`, `/ics/<zone>`, `/api/search-index/<version>`, `/robots.txt`, `/sitemap.xml`, icons, manifest, `/og.png`, 404s) → `[]`
- Keep only allowed parameters, first value of each, in allowlist order (stable). An allowed parameter with an empty value is kept as is (`?nr=` must still reach the `/numer` handling). Values are re-encoded with `URLSearchParams` (that is fine; say so).
- In `proxy()`: for `GET` and `HEAD` only, if `cleanQuery` says so, return a **308** to the same origin+path with the clean query (`request.nextUrl.clone()`, set `search`). Do this **before** the gate check, so it works the same gated or not (a redirect reveals nothing). Everything else in the proxy unchanged; the existing `missingNumber` and the gate keep working on the cleaned URL after the redirect.
- Never touch: `/_next/*` (all of it, not only static), `/_vercel/*`, `/api/revalidate`, `/.well-known/*`. Extend the matcher exclusion to `_next/` and `_vercel/` if needed (keep `api/revalidate` excluded). Do not break React Server Component requests: the site uses plain `<a>` links, but check for `next/link`/router usage; if any client navigation exists, leave requests with the `RSC` header or an `_rsc` parameter untouched and say so.
- No client JS changes. No new dependency.

### Fix the false comment
- `web/app/api/search/route.ts` lines ~5–8 claim "Rate limiting lives in the Vercel WAF rule on /api/*". There is no WAF rule (launch is without it). Rewrite the comment truthfully: no rate limit; the CDN caches each `q` (unknown parameters are redirected away by `proxy.ts`), the data cache in `lib/schedule.ts` absorbs the rest; tagged `DATASET` so `/api/revalidate` purges it. Grep the repo (outside `docs/tasks/`) for other claims that a WAF rule/rate limit exists and correct them (`docs/launch.md`: add one line "No Vercel WAF at launch; unknown query parameters are redirected to the clean URL (task 62)").

### Tests
- Unit tests (`web/lib/clean-query.test.ts`, node:test): `/adres/X?x=1` → `""`; `/adres/X?nr=12&x=1` → `"?nr=12"`; `/adres/X?nr=12` → `null`; `/adres/X?nr=` → `null`; `/adres/X?nr=1&nr=2` → `"?nr=1"`; `/adres/X/harmonogram.pdf?nr=7%2F22&utm_source=a` → `"?nr=7%2F22"`; `/api/search?q=asn` → `null`; `/api/search?q=asn&x=1` → `"?q=asn"`; `/?x=1` → `""`; `/ulice?utm_source=fb` → `""`; `/ics/Z?x=1` → `""`; `/api/search-index/abc?x=1` → `""`; no query → `null`.
- CI check (extend an existing script, e.g. `web/scripts/check-indexing.mjs` runs in both builds, or a small new `check-query.mjs` step before the importer steps), against `next start`, using `redirect: "manual"`: `/adres/<fixture street>?x=1` → 308, `Location` path `/adres/<id>` with no query; `/adres/<id>?nr=12&x=1` → 308 to `?nr=12`; `/adres/<id>?nr=12` → 200 (not a redirect); `/adres/0972447-90004?nr=` → 200 (the numer page); PDF `?nr=7a&x=1` on the split street → 308; `/api/search?q=asn` → 200 JSON; `/api/search?q=asn&x=1` → 308 to `?q=asn`; `/?fbclid=1` → 308 to `/`; `/_next/static/...` (any real chunk from the home HTML) with `?x=1` → 200; `POST /api/revalidate?x=1` → not 308 (401 without the secret).

## Hard rules
- CI only: no local DB runs, no `npm run db:*`, no local `next build`/`npm run check:*`/`next start`/`next dev` (they read `web/.env.local`, whose `DATABASE_URL_UNPOOLED` points at the **production** database). Local `npm test`, `npx biome ci`, `npx tsc --noEmit`, `npm run config:check` are fine.
- Never print secrets (never cat/echo `web/.env.local` or env values). No force-push. Do not touch `stash@{0}`. Never touch `~/projects/conaulicy`.
- Do not change Vercel settings/env vars, DNS, firewall; do not remove the gate; do not dispatch any import.
- If a safety/permission block appears, stop and report; never rephrase or split an action to get around it.
- Native browser behaviour only (no custom scroll/focus/keyboard JS); links never open in a new tab; GOV.UK Design System patterns, mobile-first, WCAG AA, light theme only; Polish copy warm and neighbourly, never corporate/official; no new client JS.
- Scope only: no unrelated changes.

## Done
One commit on `feat/strip-unknown-params` (this brief included; fix-up commits are fine), PR titled "Unknown query parameters redirect to the clean URL", wait for CI green (`gh pr checks --watch`). Do not merge. Report the PR link, `git diff --stat origin/main`, CI duration, and any extra allowed parameter or RSC handling. The reviewer squash-merges after checking the diff.
