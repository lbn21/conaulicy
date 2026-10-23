# Task 70b: web, one copy of each shared list, header and text

Approved by Jakub, 23 Oct 2026, from the read-only duplication audit. Second of three PRs (70a #93 merged → 70b → 70c). Scope is exactly the items below; no new abstractions beyond those named. Behaviour stays identical, except for the three approved text changes in section 3.

## 1. Fractions: one ordered list (audit finding 1, web half)

70a added `FRACTIONS` (subtype + label, display order) to `web/lib/waste-bin.ts`. Use it for:
- `lib/schedule.ts` `SUBTYPE_ORDER` (same order: derive it from `FRACTIONS`).
- The PDF route (`app/adres/[id]/harmonogram.pdf/route.ts`): `KEY_ORDER` (~98-111) and `TONE_LABEL` (~113-125). `KEY_ORDER` lacks `zmieszane_i_bio`; check that including it changes nothing (the key iterates tones), or filter it, so the printed key is byte-for-byte the same order and labels.
- `TOKEN` and `OUTLINED` stay where they are (colour mapping, not the fraction list).

## 2. Cache headers: one constant (audit finding 4)

The DATASET responses repeat `Cache-Control: cacheControl("public, s-maxage=3600, stale-while-revalidate=86400")` + `Vercel-Cache-Tag: DATASET`: `app/ics/[zoneId]/route.ts` (~96-100), the PDF route (~1107-1111), `app/api/search/route.ts` (~13-16), `app/api/place-redirects/route.ts` (~12-15). The PDF's 308 and 404 send `public, s-maxage=3600` (no swr) at ~1081 and ~1091.

In `lib/gate.ts` add `datasetHeaders(publicValue = "public, s-maxage=3600, stale-while-revalidate=86400")` (a function, since `cacheControl()` reads the gate at request time) returning `{ "Cache-Control": cacheControl(publicValue), "Vercel-Cache-Tag": DATASET }`. Use it at all six sites (the PDF's 308/404 pass their own value). Headers must stay byte-identical, gated and ungated. `search-index` keeps its own value.

## 3. Texts: one source each (audit findings 5 and 13), approved changes

All in `web/lib/schedule-notes.ts`:
- **Pickup note**, page, PDF and ICS: `putOutNote(time)` → `"Wystaw pojemniki do 6:00 w dniu odbioru."` with the hour from the data (leading zero dropped, as now), so another hour per zone still works. Replaces `pickup-schedule.tsx` `hour()` + "Wystaw przed posesję do godziny X." (~37-39, ~122), the ICS "Wystaw przed posesję do X." (~68) and the PDF line (~355).
- **Disclaimer**, footer, ICS and PDF: `DISCLAIMER = "Nie jesteśmy urzędem – obowiązuje harmonogram gminy."` Replaces `site-footer.tsx` (~115), ICS (~71) and the PDF's "Serwis nieoficjalny – …" (~408).
- **No more dates** (finding 13): `NO_MORE_DATES = "Nie mamy jeszcze kolejnych terminów"` and `NO_MORE_DATES_NEXT = "Dodamy je, gdy tylko gmina ogłosi nowy harmonogram."` (the place page's continuation). `pickup-schedule.tsx` (~200) renders `${NO_MORE_DATES}. ${NO_MORE_DATES_NEXT}`; `place-page.tsx` (~235) uses `NO_MORE_DATES` as the H2 and `NO_MORE_DATES_NEXT` + its existing "Do tego czasu sprawdź odbiory w harmonogramie gminy." as the paragraph. `placeDescription` stays as it is.

Update the tests and `check-*.mjs` that assert the old wording.

## 4. Static pages: one list (audit finding 6)

`app/sitemap.ts` `PAGES` (~12), `site-footer.tsx` `META` (~30-35) and `lib/clean-query.ts` `ROUTES[0]` (`/^\/(?:ulice|dostepnosc|prywatnosc|o-projekcie)?$/`) list the same pages. Add `STATIC_PAGES` (path + footer text) in `web/lib/static-pages.ts`; the sitemap (with `/` first), the footer links and the clean-query pattern come from it. The sitemap order, footer order and clean-query behaviour stay the same.

## 5. Colours: contrast check reads the site's tokens (audit finding 16)

- `design/contrast.mjs` hard-codes its own, partly old palette. Make it read the bin colours from `web/app/tokens.css` (parse the `--waste-*` custom properties) instead of its copy; keep the GOV.UK palette roles it needs (from `web/app/_palette.scss` if that is a simple parse, otherwise keep them in the script with a comment naming the source). Pairs for tokens that no longer exist on the site go; say which in the PR body.
- The PDF draws the plastik-metale diamond with stroke `#5c4800`, darker than the site's `--waste-plastik-metale-border` `#7d6200`. Keep the printed colour (no visual change): name it in the PDF route as the print outline with a one-line reason (darker for small marks on paper), add it to `tokens.css` as `--waste-plastik-metale-print` (documented in `design/tokens.md`), and add it to the contrast check against white as a "ui" pair. If you find evidence it was a mistake rather than deliberate, stop and say so in the PR instead of changing the colour.
- Run `node design/contrast.mjs` (no env needed) and paste the result in the PR body.

## 6. Small ones

- Finding 17: the ICS `X-WR-TIMEZONE:Europe/Warsaw` (~61) uses `WARSAW` from `lib/dates`.
- `lib/clean-query.ts`: add `/api/place-redirects` with no allowed params, so `?x=1` gets the same 308 to the clean URL as the other APIs. `proxy.ts`'s own fetch has no query; check the proxy/`next.config` order makes this safe, and add a line to `check-query.mjs`.

## Tests

- All of CI green (web, perf, a11y, W3C, check-pdf, check-query, check-metadata, check-indexing). Unit tests for `putOutNote`.
- Say in the PR body which visible texts changed (only the three in section 3).

## Rules

- No `npm run db:*`, no local `next build`/`start`/`dev`/`check:*` reading `web/.env.local`. Rely on CI.
- Never `vercel env run`. No force-push. Stop on any safety block and report it. Never touch `~/projects/conaulicy`.
- Branch `chore/web-consolidate` (this brief is its first commit). Open a normal PR, wait for CI, report the PR number. Do not merge.
