# Task 60: unique page descriptions and share metadata

Approved by Jakub, 22 Oct 2026 (production-release PR 3 of 4). Branch: `feat/page-descriptions` from the current `origin/main` (contains PR #80 indexing switch and the task-59 sitemap PR).

## Context

conaulicy.pl (Next.js 16 App Router in `web/`) shows waste-pickup dates for each street and village of Lubaczów (town) and gmina Lubaczów. It is free and non-commercial, made by a neighbour, not by the council. It is still behind a Basic Auth gate; we are preparing it for Google. Today **every page shares one generic description** (`web/app/layout.tsx` `metadata.description`), so Google shows the same snippet for ≈330 place pages. Place URLs stay exactly `/adres/<TERYT id>`; no slugs.

Relevant code: `web/components/place-page.tsx` `placeMetadata(id, nr, missing)` (used by `/adres/[id]`, `/adres/[id]/nr/[...nr]`, `/adres/[id]/numer`; sets `title` and canonical `/adres/<id>`); `PlaceView` in `web/lib/schedule.ts` has `kind: "ulica" | "wies"`, `label` (street: `"ul. Rynek, Lubaczów"`, `"Osiedle Mickiewicza, Lubaczów"`, or a street in a village; village: `"Szczutków (gm. Lubaczów)"`, village part: `"Dąbrowa (Basznia Górna, gm. Lubaczów)"`), `name`, `gmina`, `askNumber` etc. — see `web/lib/places.ts` for how labels are built. Static pages: `web/app/page.tsx` (home), `web/app/dostepnosc`, `web/app/prywatnosc`, `web/app/o-projekcie` (each `metadata` has only `title`, plus the canonical added in task 59). `metadataBase` is `SITE_URL` https://conaulicy.pl.

## Changes

### Place pages (`placeMetadata`)
- A unique `description` per place, built from the place's own label, correct for street vs village. Suggested (refine the Polish if you find a warmer, natural wording; keep it ≤ ~155 characters, no keyword stuffing, no "urzędowy" tone, no claims we cannot keep):
  - street: „Terminy wywozu śmieci: ul. Rynek, Lubaczów. Dodaj je do kalendarza w telefonie albo pobierz harmonogram do wydruku.”
  - village: „Terminy wywozu śmieci: Szczutków (gm. Lubaczów). Dodaj je do kalendarza w telefonie albo pobierz harmonogram do wydruku.”
  - Avoid Polish declension of place names (e.g. „w Lubaczowie”, „przy ulicy …”) unless it is correct for every label; the colon form avoids it.
  - A street/village without any schedule (see `hasUpcoming`/the "street-without-schedule" and "street-schedule-ended" cases in the CI fixture): use a description that does not promise dates/PDF if the page does not offer them (check what the page shows in those cases).
- `openGraph`: `url: /adres/<id>` (canonical, never the `/nr/` or `/numer` path), `title` = the page title, `description` = the same description; keep the site-wide share image, `siteName`, `locale`, `type` from the layout (Next replaces, not merges, nested `openGraph` objects — make sure the image/siteName/locale still appear on place pages; factor a small shared base if needed). Same for `twitter` title/description if the layout's twitter block would otherwise be lost.
- The house-number variant (`/nr/`) and `/numer` keep the same description as the place (they are canonicalised/noindexed anyway). The error title (`Błąd: …`) stays as is.

### Static pages
- Own `description` (+ `openGraph` `url`/`title`/`description`, keeping the shared image/siteName/locale) for `/`, `/dostepnosc`, `/prywatnosc`, `/o-projekcie`. Write them from what each page actually says (read the page text). Warm and neighbourly; e.g. home: „Sprawdź, kiedy śmieciarka przyjedzie na Twoją ulicę w Lubaczowie albo do Twojej wsi w gminie Lubaczów. Terminy do kalendarza w telefonie i do wydruku.”
- Keep the layout default description as the fallback (used by 404).
- Titles: check they are unique per page already (`%s – conaulicy` template; home has the default). Do not change them unless two pages collide.

### Optional: WebSite JSON-LD on the home page only
- A small server-rendered `<script type="application/ld+json">` with `@type: WebSite`, `name: "conaulicy.pl"`, `url: "https://conaulicy.pl/"`, `inLanguage: "pl"`. **No `SearchAction`** (our search works on the device, there is no search-results URL Google could use). It must add **zero client JS** (rendered on the server in the page, not via a client component) and must pass Nu Html Checker. Skip it if it complicates anything; say whether you added it.

### CI check
- Extend an existing check (e.g. `web/scripts/check-html.mjs` already fetches every route in `ROUTES` of `scripts/lib/server.mjs`, or `check-indexing.mjs`) — or add a small `scripts/check-metadata.mjs` with its own CI step, before the importer steps: for every 200 route in `ROUTES` without `?nr`, exactly one `<title>`, exactly one `<meta name="description">`, non-empty, ≤ 160 characters; titles and descriptions unique across those routes (house-number/`?nr` variants and `/numer` excluded from the uniqueness check); place pages have `og:url` = `https://conaulicy.pl/adres/<id>` and `og:image` present; static pages have `og:url` equal to their canonical. If JSON-LD added: it parses as JSON.
- Nu, axe and Lighthouse (existing CI) must stay green; first-load JS budget (`npm run budget`) must not grow.

## Hard rules
- CI only: no local DB runs, no `npm run db:*`, no local `next build`/`npm run check:*`/`next start`/`next dev` (they read `web/.env.local`, whose `DATABASE_URL_UNPOOLED` points at the **production** database). Local `npm test`, `npx biome ci`, `npx tsc --noEmit`, `npm run config:check` are fine.
- Never print secrets (never cat/echo `web/.env.local` or env values). No force-push. Do not touch `stash@{0}`. Never touch `~/projects/conaulicy`.
- Do not change Vercel settings/env vars, DNS, firewall; do not remove the gate; do not dispatch any import.
- If a safety/permission block appears, stop and report; never rephrase or split an action to get around it.
- Native browser behaviour only (no custom scroll/focus/keyboard JS); links never open in a new tab; GOV.UK Design System patterns, mobile-first, WCAG AA, light theme only; Polish copy warm and neighbourly, never corporate/official; no new client JS.
- Scope only: metadata. No visible page changes, no unrelated refactors.

## Done
One commit on `feat/page-descriptions` (this brief included; fix-up commits are fine), PR titled "Own description and share metadata for every page", CI green (`gh pr checks --watch`). Do not merge. In the PR description and your report list: the final description templates (street, village, no-schedule) and the four static-page descriptions verbatim, whether JSON-LD was added, `git diff --stat origin/main`, CI duration. The reviewer squash-merges after checking the diff.
