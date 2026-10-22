# Task 59: sitemap.xml and duplicate-page hygiene

Approved by Jakub, 22 Oct 2026 (production-release PR 2 of 4). Branch: `feat/sitemap` from the current `origin/main` (876484a or later; contains task 58, PR #80: `web/lib/indexing.ts` `indexable()`, `web/scripts/check-indexing.mjs --expect=noindex|index`, and the CI step that makes a second, production-like build with `VERCEL_ENV=production`).

## Context

conaulicy.pl (Next.js 16 App Router in `web/`) shows waste-pickup dates per street/village in Lubaczów. It is still behind a Basic Auth gate; launch comes later. This PR prepares what Google needs: a sitemap with every page we want indexed, and no indexable duplicates.

Pages to index: `/`, `/dostepnosc`, `/prywatnosc`, `/o-projekcie`, and one `/adres/<id>` per place (≈330 in production; place ids are TERYT-based, e.g. `/adres/0972447-19253`; **URLs stay exactly as they are, no slugs**). `searchIndex()` in `web/lib/schedule.ts` (≈line 255) returns every searchable place as `[id, label]`; it is an `unstable_cache` with tag `dataset` (`DATASET`) and `revalidate: 3600`; `POST /api/revalidate` (called after an import) runs `revalidateTag(DATASET)`.

Not to index (duplicates/files): `/adres/<id>/nr/...` (house-number variant via `?nr=`; canonical already → `/adres/<id>`, `components/place-page.tsx` `placeMetadata`), `/adres/<id>/numer` (error variant), `/adres/<id>/harmonogram.pdf`, `/ics/<zoneId>`, `/api/*`.

## Changes

### `web/app/sitemap.ts` (new)
- `MetadataRoute.Sitemap`: the 4 static pages + one entry per place id from `searchIndex()`, absolute URLs built from `SITE_URL` (`web/lib/config.generated.ts`), ids passed through `encodeURIComponent` like `placeMetadata` does. Order: static pages first, then places in `searchIndex()` order. No `/nr/`, `/numer`, PDF or ICS URLs. Do not invent `lastModified`/`priority`/`changeFrequency` (Google ignores priority/changefreq; omit `lastModified` unless there is a real data timestamp you can read from the same cached call without a new DB query — then explain).
- When `!indexable()`: return `[]` (an empty, valid `<urlset>`). While gated, `proxy.ts` blocks it anyway.
- **Caching decision (implement this, and explain it in a comment and the PR):** do not add a new DB read and do not make it fully dynamic. Use the existing cached `searchIndex()` and make the route ISR with `export const revalidate = 3600` (same as `CACHE`), so it is rendered at build (the build already reads the DB for the home page's search index), cached on the CDN, refreshed hourly as a safety net, and purged by `/api/revalidate` through the `dataset` tag that `searchIndex()` carries. Verify in the build output that `/sitemap.xml` is `○` with Revalidate 1h (not `ƒ`). If Next 16 does not propagate the `unstable_cache` tag to the sitemap route, say so in the PR and keep the hourly revalidate (acceptable: new streets are rare).
- Keep it well under 50 000 URLs/50 MB (one file is fine; no sitemap index).

### Noindex on files and duplicates
- `web/app/adres/[id]/harmonogram.pdf/route.ts` and `web/app/ics/[zoneId]/route.ts`: add `X-Robots-Tag: noindex` to their successful responses (and to their 404/error responses too). Keep every other header (Cache-Control via `cacheControl`, `Vercel-Cache-Tag`) unchanged. Prefer one small shared constant if both need it; no new abstraction beyond that.
- `/adres/[id]/numer`: metadata `robots: { index: false, follow: true }` (keep the canonical). Do it where it applies only to this route (e.g. the `missing` branch in `placeMetadata` or the page's `generateMetadata`), not to `/adres/[id]` or `/nr/`.
- `/adres/[id]/nr/...`: keep as is (canonical → `/adres/<id>` is enough; it stays indexable-but-canonicalised). Do not add noindex there.
- Canonical on `/` and the three static pages: `alternates: { canonical: "/" }`, `"/dostepnosc"`, etc. (metadataBase already resolves them to https://conaulicy.pl). Check the root layout does not set a canonical that every page would inherit.
- Do not change the noindex/meta logic from task 58 otherwise.

### CI: extend `web/scripts/check-indexing.mjs`
- `--expect=noindex` (normal CI build): `/sitemap.xml` is 200, `Content-Type` XML, a well-formed `<urlset>` with **zero** `<url>` entries.
- `--expect=index` (production-like build): `/sitemap.xml` is well-formed XML (parse it; a regex count alone is not enough — use a small dependency-free check, e.g. count `<loc>` and verify the document opens with `<?xml` and `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` and closes properly; no new npm dependency), every `<loc>` is absolute `https://conaulicy.pl/...`, no duplicates, none contains `/nr/`, `/numer`, `.pdf` or `/ics/`; it contains the 4 static URLs; and the place count equals the number of places in the CI fixture search index (read the expected list from the running app, e.g. the home page's search-index URL `/api/search-index/<version>`, rather than hardcoding a number), so total = places + 4. Also check that the fixture routes from `ROUTES` in `scripts/lib/server.mjs` that are place pages without `?nr` appear in the sitemap.
- Both modes: `/adres/<split-street>/harmonogram.pdf` (or any fixture place PDF that check-pdf.mjs uses) and one `/ics/<zone>` (take one from a place page's ICS link) send `X-Robots-Tag` containing `noindex`; `/adres/0972447-90004?nr=` (rewritten to `/numer`) has meta robots `noindex, follow` in index mode; `/`, `/dostepnosc`, `/prywatnosc`, `/o-projekcie` each have exactly one `<link rel="canonical" href="https://conaulicy.pl/...">` with the right path.
- Keep the step order from task 58 (both indexing steps before the importer checks, which empty the DB).

### Docs
- `docs/launch.md`: a "Sitemap" paragraph (what is in it, the caching decision, that robots.txt names it only when indexable, and: after launch submit `https://conaulicy.pl/sitemap.xml` in Google Search Console).

## Hard rules
- CI only: no local DB runs, no `npm run db:*`, no local `next build`/`npm run check:*`/`next start`/`next dev` (they read `web/.env.local`, whose `DATABASE_URL_UNPOOLED` points at the **production** database). Local `npm test`, `npx biome ci`, `npx tsc --noEmit`, `npm run config:check` are fine.
- Never print secrets (never cat/echo `web/.env.local` or env values). No force-push. Do not touch `stash@{0}`. Never touch `~/projects/conaulicy`.
- Do not change Vercel settings/env vars, DNS, firewall; do not remove the gate; do not dispatch any import.
- If a safety/permission block appears, stop and report; never rephrase or split an action to get around it.
- Native browser behaviour only (no custom scroll/focus/keyboard JS); links never open in a new tab; GOV.UK Design System patterns, mobile-first, WCAG AA, light theme only; Polish copy warm and neighbourly, never corporate/official; no new client JS.
- Scope only: no unrelated changes.

## Done
One commit on `feat/sitemap` (this brief included; fix-up commits are fine), PR titled "sitemap.xml; noindex on PDF, ICS and the number-error page; canonicals", wait for CI green (`gh pr checks --watch`). Do not merge. Report the PR link, `git diff --stat origin/main`, CI duration, the build-output line for `/sitemap.xml`, and whether the `dataset` tag reaches the sitemap. The reviewer squash-merges after checking the diff.
