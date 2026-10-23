# Task 70c: pages, one copy of each shared step

Approved by Jakub, 23 Oct 2026, from the read-only duplication audit. Last of three PRs (70a #93, 70b #94 → 70c). Scope is exactly the items below; no new abstractions beyond those named. Behaviour stays identical: same HTML titles, meta tags, links, statuses and headers. (Finding 13, the "no more dates" text, was done in 70b.)

## 1. Title passed once (audit finding 7)

Pages write `title: X, ...pageMetadata({ title: X, … })`: `app/ulice`, `app/o-projekcie`, `app/dostepnosc`, `app/prywatnosc`, `app/szukaj` and `components/place-page.tsx` (`placeMetadata`). Make `pageMetadata` (`lib/share.ts`) also return `title` as given (a string goes through the layout's template, `{ absolute }` stays absolute), and drop the callers' own `title:`. The rendered `<title>`, `og:title` and `twitter:title` must not change on any page.

The literal "conaulicy.pl" as the site's name uses `SITE_NAME`: `app/page.tsx` (WebSite JSON-LD `name`), the PDF's `Author` (~375), `app/manifest.ts` `short_name` (and `name` via a template string). Output identical.

## 2. Error summary: one component (audit finding 8)

`components/place-page.tsx` `ErrorSummary` (~98-113, link `#nr`) and the inline copy in `app/szukaj/page.tsx` (~80-96, link `#adres`). Move it to `components/error-summary.tsx` as `ErrorSummary({ error, href })`, used by both. Same HTML.

## 3. Address links: one helper (audit finding 9)

`placeHref` (`lib/search.ts` ~351-355) builds `/adres/{id}[?nr=]`. Hand-built copies: `app/page.tsx` (~63), `app/ulice/page.tsx` (~33), `components/place-page.tsx` (~55, ~129, ~271), `app/adres/[id]/page.tsx` (~25), the PDF's QR/link URL (~1100, `${SITE_URL}/adres/${place.id}?nr=…`, prefix `SITE_URL` to `placeHref`). Use `placeHref` (or a tiny `placePath(id, nr?)` in the same file if `placeHref`'s `SearchHit` type doesn't fit; then `placeHref` uses it). Note the copies differ in `encodeURIComponent`; ids are `[0-9-]` so the output is identical — check that, and keep it identical.

## 4. Moved-address redirect: one helper (audit finding 10)

`redirectIfMoved` in `components/place-page.tsx` (~42-47) and the PDF route's own lookup (~1066-1085) do the same: no place → `placeRedirect(id)` → `movedPath(...)`. Add `movedTarget(id, path): Promise<string | null>` next to `movedPath` in `lib/places.ts` (or `lib/schedule.ts` if that is where `getPlace`/`placeRedirect` live and an import cycle would follow) and use it in both. The page still `permanentRedirect`s, the PDF still answers its own 308 with its headers. Statuses stay 308.

## 5. lib/schedule.ts zone members (audit finding 11)

The zone-members select at ~244-255 and ~357-369 is the same query; make it one local (non-exported) function `wasteMembers(where)` in `lib/schedule.ts`. Same SQL.

## 6. Pickup-schedule types (audit finding 12)

`components/pickup-schedule.tsx` (~14-21) redeclares the pickup types; use `import type` from `lib/schedule` (its `Pickup` has `shiftedFrom`, which is fine). If a serialisation boundary (client component props) makes the shared type wrong, use `Pick<>` of it rather than a copy.

## 7. Secret compare: one helper (audit finding 14)

`digest` + `timingSafeEqual` in `proxy.ts` (~15-29) and `app/api/revalidate/route.ts` (~15-22). Move to `lib/secret.ts` as `sameSecret(given, expected): boolean` (sha-256 both, then `timingSafeEqual`); both use it. Check it is fine in the proxy's runtime (it already imports `node:crypto`).

## 8. Stale comments

- `lib/normalize.ts` (1-3): describe where `normalize` is actually used today (importer, search index on the device, /api/search); check the code, don't guess.
- `app/api/revalidate/route.ts` (~8): the Vercel-Cache-Tag list misses `/api/place-redirects`; list it.
- `lib/schedule.ts` (~227) "~4 KB gzip": measure the search index (gzip size of the fixture or of production `https://conaulicy.pl/api/search-index/…` with `curl`, read-only) and write the measured figure with the date, or remove the number.

## Tests

- All of CI green (web, perf, a11y, W3C, check-metadata, check-indexing, check-query, check-pdf, check-import). Add a unit test for `movedTarget` and `sameSecret` if cheap.
- PR body: confirm titles/meta unchanged (check-metadata covers it) and list each finding done.

## Rules

- No `npm run db:*`, no local `next build`/`start`/`dev`/`check:*` reading `web/.env.local`. Rely on CI.
- Never `vercel env run`. No force-push. Stop on any safety block and report it. Never touch `~/projects/conaulicy`.
- Branch `chore/pages-consolidate` (this brief is its first commit). Open a normal PR, wait for CI, report the PR number. Do not merge.
