# Task 64: GOV.UK conformance fixes (one PR)

Approved by Jakub, 23 Oct 2026 ("jeden PR jest spoko"). Branch: `fix/govuk-conformance` from the latest `origin/main` (`git fetch && git switch main && git pull --ff-only && git switch -c fix/govuk-conformance`; 647a2a1 or later).

Reference: GOV.UK Design System + Service Manual (progressive enhancement). Keep our own amber colours/logo, light theme only, self-hosted fonts. Copy in warm, neighbourly Polish, not bureaucratic.

## H1 – Search must work without JavaScript
- Home search: wrap in `<form method="get" action="/szukaj">`, input `name="q"` (keep the existing label/hint), plus a plain `govuk-button` „Szukaj” (no `data-module` needed; `type="submit"`). Must not cause layout shift (CLS check in CI must still pass) – render the button server-side, not injected by JS.
- Keep accessible-autocomplete as progressive enhancement: with JS, picking a suggestion still navigates straight to the street page (as now). Enter with no highlighted suggestion must submit the form natively. Remove the `name: ""` workaround so the enhanced input submits as `q`. Reconsider `autoselect`: decide what Enter on typed text with results should do (GOV.UK default is autoselect off → Enter submits the form → /szukaj handles 1/many). Pick the option closest to GOV.UK/native behaviour and document the choice in the PR body.
- New server-rendered page `/szukaj?q=` (reuse the same matching as the autocomplete / `/api/search`, incl. house-number parsing):
  - exactly one match → redirect (303 or 308, your choice; document) to that address page, keeping the house number: „Asnyka 12” → `/adres/<id>?nr=12` (or the existing number-route form if that's how split streets work). `q=Rynek` → `/adres/0972447-19253`.
  - several matches → GOV.UK-style results: H1, count sentence, `govuk-list` of links to the places, search field again.
  - zero → warm „Brak wyników” message (e.g. „Nie znaleźliśmy „xyzqq”.”), suggestions (check spelling, type only the street name), link „Wszystkie ulice i wsie” to `/ulice`, and the search form again with the value prefilled.
  - empty/whitespace `q` → GOV.UK error-message pattern (error summary + `govuk-error-message` on the field, title prefixed „Błąd: ”), or redirect to `/` – prefer the error pattern.
  - `/szukaj` is noindex (header + meta via existing mechanisms), in the `clean-query.ts` allowlist keeping `q`, not in the sitemap, no client JS required.
- Update `/dostepnosc`: remove/adjust the sentence saying search needs JavaScript. Don't promise more than you tested.

## H2 – Unknown address ids must be a real 404
`/adres/9999999`, `/adres/abc`, `/adres/0972447-99999` currently return an empty Next error shell (`id="__next_error__"`, empty body without JS). Find the root cause (`notFound()` in page vs `generateMetadata` vs proxy/streaming) and fix so the raw HTML has `<html lang="pl">`, the stylesheet and the 404 h1, status 404. Add a CI test asserting raw HTML (no JS) contains the h1 for these ids.

## M1 – Street page components
- Data disclaimer („Te daty odczytaliśmy automatycznie…”) → `govuk-warning-text` (with the „!” icon and visually hidden „Uwaga”).
- Next pickup no longer inside `govuk-inset-text` (plain heading/summary row). At most one inset per page.

## M2 – 404 per https://design-system.service.gov.uk/patterns/page-not-found-pages/
Title „Nie znaleziono strony – conaulicy.pl”, H1 „Nie znaleziono strony”, Polish equivalents of the 3 standard sentences:
- „Jeśli adres został wpisany ręcznie, sprawdź, czy jest poprawny.”
- „Jeśli adres został wklejony, sprawdź, czy skopiowano go w całości.”
- „Jeśli adres jest poprawny albo kliknięto link lub przycisk, napisz do nas: kontakt@conaulicy.pl” (mailto link)
plus a link to the home page (e.g. „Sprawdź dzień wywozu śmieci”). Same content for both 404 paths (global not-found and address not-found).

## M4 – Places with no data
11 places have no pickup data (today: Chełmońskiego, Działkowa, Gierymskiego, Grottgera, Kossaka, Łąkowa, Podleśna, Ustronna, Osiedle Mickiewicza, Osiedle Unii Lubelskiej, al. kard. Jaworskiego). **Derive from the data, don't hardcode.** On `/ulice` show „(brak danych)” next to them; their pages get noindex; drop them from the sitemap. Their pages still return 200 with the existing gmina link. Sitemap expected 335 → 324.

## L1 – Titles
Format „<H1> – conaulicy.pl” everywhere (home: „Sprawdź dzień wywozu śmieci – conaulicy.pl”). One service name „conaulicy.pl” in titles, header and og tags (og:site_name etc.).

## L2 – 404 robots
404 pages output exactly one robots meta: `noindex` (no conflicting index/follow tags).

## L3 – `?nr=` only where split
Ignore/strip `?nr=` on places not split by house number (don't echo arbitrary numbers like „Chełmońskiego 9999” in H1/title). Keep it where split streets exist (none today, keep the code path working). Keep `clean-query.ts` consistent.

## L5 – „Najbliższy odbiór:” for screen readers
Screen readers must hear „Najbliższy odbiór:” before the date: use visible text or `govuk-visually-hidden`, not an aria-hidden-only label.

## Out of scope
Back link on the number page, phase banner, the /ulice 0–9 group. No unrelated changes.

## Tests (CI)
Extend existing CI checks (axe / W3C / e2e / check-query / sitemap scripts): `/szukaj` with 0, 1 (redirect target incl. `nr`), many results and empty q; no-JS form submission from the home page (raw HTML has `<form` with `action="/szukaj"` and `name="q"`, and a GET to the form action works); H2 raw HTML h1 + status 404; sitemap count change; titles; „(brak danych)” on /ulice; noindex on a no-data page and on /szukaj.

## Hard rules
- CI only: no local DB runs, no `npm run db:*`, no local `next build`/`npm run check:*`/`next start`/`next dev` (they read `web/.env.local`, whose `DATABASE_URL_UNPOOLED` points at the **production** database). Local `npm test`, `npx biome ci`, `npx tsc --noEmit`, `npm run config:check` are fine.
- Never print secrets (never cat/echo `web/.env.local` or env values). No force-push to main. Do not touch `stash@{0}`. Never touch `~/projects/conaulicy`.
- Do not change Vercel settings/env vars, DNS, firewall; do not dispatch any import.
- If a safety/permission block appears, stop and report; never rephrase or split an action to get around it.
- Native browser behaviour only: no custom scroll/focus/keyboard JS; links never open new tabs. Minimal code.

## Done
Commits on `fix/govuk-conformance` (this brief included), PR titled "GOV.UK conformance: no-JS search, real 404s, components, titles", PR body summarising each item (H1…L5) and decisions taken. Wait for CI green (`gh pr checks --watch`), fix failures. Do not merge. Report the PR link, `git diff --stat origin/main`, CI duration and decisions.
