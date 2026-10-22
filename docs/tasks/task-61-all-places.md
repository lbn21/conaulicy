# Task 61: „Wszystkie ulice i wsie” — a plain list page of every place

Approved by Jakub, 22 Oct 2026 (production-release PR 4 of 4). Branch: `feat/all-places` from the current `origin/main` (contains PR #80 indexing switch, the task-59 sitemap and task-60 descriptions PRs).

## Why

conaulicy.pl (Next.js 16 App Router in `web/`) shows waste-pickup dates for each street and village of Lubaczów (town) and gmina Lubaczów, one page per place at `/adres/<TERYT id>` (URLs stay exactly as they are; no slugs). Today the home page links only 4 example places; every other place is reachable only through the JS search field. Google and people without JS (or who prefer to browse) need a plain list of links to every place.

## Changes

### New page `web/app/ulice/page.tsx` → `/ulice`
- Title „Wszystkie ulice i wsie”, its own `description` and `openGraph` url/title/description in the same style as the other pages (see how task 60 did it; keep the shared share image), canonical `/ulice`.
- Server-rendered, **zero client JS**: no client component, no search/filter widget, no JS anywhere on the page beyond what every page already loads.
- Data: the same set of places as the sitemap — every place from `searchIndex()` in `web/lib/schedule.ts` (cached with tag `dataset`, refreshed by `POST /api/revalidate` after an import). If you need `kind`/locality to group them and `searchIndex()` only gives `[id, label]`, add the minimum needed: preferably derive groups from data already in that cached call, or add one small `unstable_cache` read with the same `CACHE` (tag `dataset`) — no new uncached DB query. Page ISR: `export const revalidate = 3600` like the rest, and confirm in the build output it is `○` with Revalidate 1h.
- Structure (GOV.UK patterns, mobile-first):
  - `h1` „Wszystkie ulice i wsie”, one short warm intro line (e.g. „Wybierz swoją ulicę albo wieś, żeby zobaczyć terminy wywozu śmieci.”) and a plain link back to the search on the home page.
  - Two sections with `h2`: „Ulice w Lubaczowie” (streets of the town) and „Wsie w gminie Lubaczów” (villages and village parts; streets inside villages, if any exist in the data, either listed under their village or in the villages section by their full label — pick the clearer option and explain).
  - Town streets: alphabetical with letter headings (`h3`, one per first letter) so the long list is scannable; sort and group with Polish collation (`Intl.Collator("pl")`), so Ł comes after L, Ś after S, Ż/Ź at the end. Sort by the street's own name, not by the prefix („ul.”, „al.”, „os.”), but display the full label as the place pages do (you may drop the trailing „, Lubaczów” inside the town section if it only repeats the heading — your call, consistent).
  - Each place is a plain `<a class="govuk-link" href="/adres/<id>">` in `<ul class="govuk-list">`. Never `target="_blank"`.
  - Optional: a compact A–Z jump list of plain in-page anchor links (`#litera-a`) at the top of the town section — native anchors only, no JS, no custom scroll/focus handling. Only if it passes axe and looks right on mobile.
- Use only GOV.UK Frontend classes; `scripts/check-own-css.mjs` caps own CSS — add none unless essential.

### Links to it
- Home page (`web/app/page.tsx`): right after the „Przykładowe adresy” list, a plain link „Zobacz wszystkie ulice i wsie” (govuk-link, inside a `govuk-body` paragraph).
- Footer (`web/components/site-footer.tsx`): add „Wszystkie ulice i wsie” → `/ulice` to the `META` links (before „Dostępność”). Do not switch on the footer navigation section.

### Sitemap, indexing, routes for checks
- Add `/ulice` to `web/app/sitemap.ts` static pages (so total = places + 5); update `web/scripts/check-indexing.mjs` expectations (+ canonical check for `/ulice`).
- Add `{ path: "/ulice", name: "all-places" }` to `ROUTES` in `web/scripts/lib/server.mjs`, so Nu (check-html), axe (check-a11y), metadata uniqueness and the bundle budget cover it. If Lighthouse (`scripts/check-perf.mjs`/`docs/perf.md`) has a per-page list, add `/ulice` there with the same budgets as the static pages if it passes; otherwise say why not.
- A CI assertion (in an existing check script is fine): `/ulice` lists every place id of the fixture search index exactly once as a link to `/adres/<id>`, the town streets are in Polish collation order, and the page ships no page-specific JS chunk beyond the shared ones (check-bundle/budget).

### Screenshot
- If you can produce screenshots in CI without extra dependencies (Playwright is already installed there), add an optional artifact upload of a mobile (390 px) and desktop screenshot of `/ulice` from the CI build. Do not run a local build to make screenshots. Report the artifact name, or say none was made.

## Hard rules
- CI only: no local DB runs, no `npm run db:*`, no local `next build`/`npm run check:*`/`next start`/`next dev` (they read `web/.env.local`, whose `DATABASE_URL_UNPOOLED` points at the **production** database). Local `npm test`, `npx biome ci`, `npx tsc --noEmit`, `npm run config:check` are fine.
- Never print secrets (never cat/echo `web/.env.local` or env values). No force-push. Do not touch `stash@{0}`. Never touch `~/projects/conaulicy`.
- Do not change Vercel settings/env vars, DNS, firewall; do not remove the gate; do not dispatch any import.
- If a safety/permission block appears, stop and report; never rephrase or split an action to get around it.
- Native browser behaviour only (no custom scroll/focus/keyboard JS); links never open in a new tab; GOV.UK Design System patterns, mobile-first, WCAG AA, light theme only; Polish copy warm and neighbourly, never corporate/official; no new client JS.
- Scope only: no unrelated changes.

## Done
One commit on `feat/all-places` (this brief included; fix-up commits are fine), PR titled "„Wszystkie ulice i wsie”: a plain list of every place", CI green (`gh pr checks --watch`). Do not merge. Report the PR link, `git diff --stat origin/main`, CI duration, the build-output line for `/ulice`, how village streets were grouped, and the screenshot artifact (if any). The reviewer squash-merges after checking the diff.
