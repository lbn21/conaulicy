# IMGW meteo warnings

What the site reads from IMGW-PIB and how (task 97) and the banner that shows it (task 98). Code: `web/lib/imgw-warnings.ts` (feed), `web/lib/imgw-banner.ts` (what the banner says), `web/components/imgw-banner.tsx` (the banner and its data cache); fixtures: `web/lib/imgw-fixture.ts`; dev mock: `web/lib/imgw-mock.ts`. Hydro warnings are out of scope (no powiat code, `DATA-INVENTORY.md` §5).

## Endpoint

`GET https://danepubliczne.imgw.pl/api/data/warningsmeteo`: the official public API ([apiinfo](https://danepubliczne.imgw.pl/apiinfo)). No key, no documented rate limit (apiinfo and the regulamin name none). It answers `200`, `application/json; charset=utf-8`, `cache-control: no-store`, non-ASCII escaped as `\uXXXX`.

Two shapes, both seen live:

- **Warnings in force or to come:** a JSON list (24 Oct 2026: 8 items, 4025 bytes).
- **None:** an object, not an empty list: `{"message":"Brak ostrzeżeń meteorologicznych"}` (18 Oct 2026). An empty list is handled the same.

Anything else (another object, HTML, a non-2xx status, no answer within 5 s) is an upstream failure.

## Fields

Every value is a string except `teryt`.

| Field | Example | Use |
|---|---|---|
| `id` | `Sk20261024094211181` | `id`; the same id on meteo.imgw.pl |
| `nazwa_zdarzenia` | `Silny wiatr` | `event` |
| `stopien` | `"2"` | `level`: 1, 2 or 3 (IMGW's three warning levels); anything else skips the item |
| `prawdopodobienstwo` | `"75"` | `probability`, percent: IMGW's forecast chance that the event happens as warned (whole number 0–100) |
| `obowiazuje_od` | `2026-10-25 08:00:00` | `validFrom` |
| `obowiazuje_do` | `2026-10-25 18:00:00` | `validTo`; dropped once past |
| `opublikowano` | `2026-10-24 11:42:00` | `published` |
| `tresc` | `Prognozuje się …` | `text` |
| `komentarz` | `Brak.` | not used |
| `biuro` | `Centralne Biuro Prognoz Meteorologicznych w Warszawie` | `office` |
| `teryt` | `["0221", "0207", …]` | the powiats covered |

A malformed item (missing or empty text, unknown level, bad time, bad `teryt`) is skipped and logged; it never fails the feed.

## Area: powiat TERYT

`teryt` lists 4-digit powiat codes (województwo + powiat). Ours: gminas `1809011` (Lubaczów, miasto) and `1809042` (gmina Lubaczów) → the first 4 digits → `1809`, powiat lubaczowski. The allowed codes are derived from the gminas in `etl/sources.yaml` (`POWIATS`), so a new gmina in another powiat adds its code.

## Times: Europe/Warsaw, no zone

The API's times carry no zone. They are Warsaw wall time. Proof, 24 Oct 2026: meteo.imgw.pl's `osmet-teryt` feed gave the same 8 ids with zoned times. Every `opublikowano` (24 Oct) is `+02:00` (CEST), and every validity time on 25 Oct, after the 03:00 → 02:00 change, is `+01:00` (CET), with the same wall clock as the API. The test `times match meteo.imgw.pl's zoned times…` checks all 24 values.

The output is ISO 8601 with the offset (`2026-10-25T08:00:00+01:00`). In the doubled hour (last Sunday of October, 02:00–02:59) `validFrom` takes the earlier (summer-time) instant and `validTo` the later one, so a warning is never shown shorter than issued. A time skipped in March moves forward an hour.

## Updates and cancellations

IMGW issues warnings, changes (ZMIANA) and cancellations (ODWOŁANIE), but the JSON has no message type and no link between a change and what it replaces. We treat each response as the current list, nothing more: a warning no longer listed is no longer shown.

## Terms: attribution

The regulamin §5 requires, wherever the data is used, the source sentence, and for processed data also the processing sentence. We filter and convert times, so both. They live in `IMGW_ATTRIBUTION` (`lib/imgw-warnings.ts`), and the banner's footer ends with both, verbatim:

> Źródłem pochodzenia danych jest Instytut Meteorologii i Gospodarki Wodnej – Państwowy Instytut Badawczy.
>
> Dane Instytutu Meteorologii i Gospodarki Wodnej – Państwowego Instytutu Badawczego zostały przetworzone.

## The banner

No public endpoint (task 98: `/api/warnings` was removed). Every page but the address pages renders `ImgwBanner`, a Server Component, at the top of `<main>` (task 104: each page draws it, no longer the root layout). The address page (`/adres/<id>`, `components/hub.tsx`) shows the same warnings, from the same copy and filter, in „Najbliższe dni” (a line each, „Teraz:” or when it starts, its tag, until when; the relative words picked by the client island, `components/upcoming.tsx`, so a cached copy never says „Teraz” after the end) and in its „Pogoda” section (event and tag, then its day and hours, absolute), or „Brak ostrzeżeń IMGW dla powiatu lubaczowskiego.” (with the notice first when the copy is old, below); its subpages (`/smieci`) show none. On every other page: GOV.UK's notification banner (neutral, `role="region"`, `aria-labelledby`, govuk-frontend 6.5.1's markup) in a two-thirds column, before the page's own row, so before its h1 (and its caption, error summary or JSON-LD, where a page has them). No client JS. The brand colour is our palette's (Wiśnia).

Warnings are powiat-wide, so every page shows the same banner (powiat `1809`, `POWIAT` in `lib/imgw-banner.ts`). Those in force or to come, highest level first, then by start; one banner, compact (task 98: 163 px at 375 px for one warning, 273 px for three):

- title „Ostrzeżenie IMGW” / „Ostrzeżenia IMGW”;
- visible, one line per warning (a list when there are several): the event, a tag „Stopień N z 3” (IMGW's own solid level colours #ffbe00 / #ff5a00 / #d60000, from `lvlToColorOsmet` in shared.imgw.pl's warnings widget, `WARNING_LEVELS` in `web/lib/palette.ts`; black text on 1 and 2, white on 3; the text says the level too) and „do niedzieli 25 października, 19:00” (in force) or „od niedzieli 25 października, 13:00” (to come);
- visible, after the lines: „Źródło: IMGW-PIB” (govuk-body-s); the full two-sentence attribution stays in the details' footer;
- then GOV.UK's details (native `<details>`, closed, no JS), „Szczegóły ostrzeżenia” / „Szczegóły ostrzeżeń”, holding per warning (headed „Silny wiatr – Stopień N z 3” when there are several) „Obowiązuje teraz, do niedzieli 25 października, 19:00.” or „Od niedzieli 25 października, 13:00 do 19:00.” (the end's day too when it ends another day), „Prawdopodobieństwo: 75%.” and `tresc` verbatim; then the link „Szczegóły i mapa na meteo.imgw.pl” and the footer: „Dotyczy całego powiatu lubaczowskiego. Stan na HH:MM.” (the last good check) and IMGW's two attribution sentences.

Nothing at all (no "no warnings" text) when there is no copy in the store yet, or the copy is fresh and has no warning. No dismiss button, no `role="alert"`.

**Honest states (task 219): never silence while the feed file exists.** One rule, by the age of the last good check (`checkAge`, `web/lib/live-status.ts`; the constants are the water's too):

- over `STALE_MS` (60 min): the banner shows on every page, with or without a warning, a notice first (a `govuk-body` paragraph, its link `govuk-notification-banner__link`): with warnings „Nie udało się teraz pobrać ostrzeżeń IMGW. Pokazujemy ostatnie dane z 9:52. Aktualne znajdziesz na meteo.imgw.pl.”, the warnings still listed; without „Nie udało się teraz pobrać ostrzeżeń IMGW. Ostatnie dane mamy z 9:52. Aktualne znajdziesz na meteo.imgw.pl.”, the notice alone;
- from `MAX_AGE_MS` (3 h): the old warnings are no longer listed (banner, „Najbliższe dni”, „Pogoda”), the notice alone: „Od 9:52 nie udało się nam pobrać ostrzeżeń IMGW, więc ich nie pokazujemy. Aktualne znajdziesz na meteo.imgw.pl.”;
- the time is the day and time („z piątku 30 października, 9:52”) when the last data is not from today (Warsaw).

The address pages have no banner: their „Pogoda” section starts with the same notice, linked the same way. With purges as in task 216 (after good checks only), a page shows the notice at its next regeneration once the threshold has passed: within its `revalidate` (600 s) and the CDN's copy.

**The store unreadable at render:** the error is thrown, not caught, and never cached as an empty state (the reader keeps nothing that threw). The documented ISR behaviour then applies: "If an error is thrown while attempting to revalidate data, the last successfully generated data will continue to be served from the cache" (https://nextjs.org/docs/app/guides/incremental-static-regeneration). A page with no last render (one rendered per request, /szukaj and the 404 page, or the first render after a purge: `revalidateTag(tag, { expire: 0 })` serves no stale copy) answers with an error until the store can be read again.

**Rendering.** Pages stay static/ISR: the root layout sets `revalidate = 600`, so every page is regenerated at most every 10 minutes (/ulice was 3600, the static pages had none). A warning that ends is dropped at the next render.

**The last good copy (task 219).** Pages never ask IMGW. The ZUK cron (`/api/cron/zuk`, every 15 minutes, no cron of its own) runs `web/lib/imgw-cron.ts`, the only fetch (`upstream`, `fetchFeed`, 5 s timeout): after a good fetch it writes the items for our powiats (`POWIATS`, `ours`) to the private Blob file `imgw/feed.json` (`{ version, fetchedAt, items }`, `feedFile`), **only when those items changed** (a few writes a day). A failed fetch, a feed of the wrong shape or a failed write leaves the file as it was; the run is then not a good check. A file that cannot be read or is not one is written afresh by the next good run.

**The status file.** Once at the end of every cron run, `handleZukCron` (`web/lib/zuk-cron.ts`, the one writer) writes `status/checks.json`: `{ version, sources: { [key]: { checkedAt, attemptAt, ok } } }`, one shape for every source key (`imgw`, `water:gmina-lubaczow`, `water:mzgkim`; `web/lib/live-status.ts`). A good try sets `checkedAt` (the last good check) to the run's start; a failed one keeps it and records `attemptAt` and `ok: false`. A line about several sources takes the oldest `checkedAt` of its keys (`oldestCheck`). A status file that cannot be read is started afresh; a failed write is logged, never the run's result.

**Read through one cache, tagged IMGW.** The banner and the weather module read both files through `imgwCopy` (`web/lib/live-store.ts`): `unstable_cache` keyed by the store, tagged `IMGW`, `revalidate: 600`, so every page reading it carries the tag (https://nextjs.org/docs/app/api-reference/functions/unstable_cache). Each read is from the Blob's origin (`get(…, { access: "private", useCache: false })`, https://vercel.com/docs/vercel-blob/private-storage). The copy's last good check is the status file's `imgw` entry, never older than the feed file's own `fetchedAt` (`imgwCopyOf`, `web/lib/imgw-banner.ts`).

**Purged after every good check (task 213, task 216, unchanged).** ISR serves the first visitor after a quiet spell the old page (and regenerates it behind), so a rarely visited page could show a warning that was issued, changed or has ended hours late. After the status file is written, a run whose IMGW check was good calls `revalidateTag("imgw", { expire: 0 })`, the feed changed or not: the cached copy of the two files and every page tagged `IMGW` (https://nextjs.org/docs/app/api-reference/functions/revalidateTag). The next view of any such page renders against the store, so its warnings and its „Stan na …” are never older than the last good run. A purge acts on Next's caches and the CDN, never on Blob: it can never delete the last good copy. IMGW down: logged, nothing purged, the pages keep their renders and show the notice once the threshold is past (above), never the water run's result or the response's status (`imgw` in the cron's JSON). (Until task 216 the run purged only when a stored signature of the shown warnings changed, in the private Blob file `imgw/shown.json`; that file is no longer read or written. Until task 219 each page fetched IMGW itself, kept 10-minute slot copies and fell back to them for 3 hours.)

## Configuration and the dev mock

`IMGW_WARNINGS_URL` (optional) sets the upstream; unset means the official endpoint. A value starting with `mock:` answers from the fixtures, through the same fetch, parse and cache path, without any network: the cron's fetch, and the pages' two files in the store (`mockFiles`, `web/lib/imgw-mock.ts`), as a good cron run would have left them (no Blob needed):

| Value | Answer |
|---|---|
| `mock:none` | the real "no warnings" object (18 Oct) |
| `mock:real` | the real 24 Oct feed, verbatim (nothing for 1809; its times are past after 25 Oct) |
| `mock:1809` | **derived, not real**: the 24 Oct feed with `1809` added to its podkarpackie warning, moved so it began an hour ago (level 1) |
| `mock:1809?level=3` | the same at level 1, 2 or 3 |
| `mock:1809?start=upcoming` | the same, starting at the next 10:00 at least two hours ahead (ends 16:00 the same day) |
| `mock:1809?start=night` | the same, starting at the next 22:00 at least two hours ahead (ends 4:00 the next day) |
| `mock:1809?also=2` / `also=2,3` | one or two more 1809 warnings at those levels, also derived: two other items of the 24 Oct feed, moved with ours |
| `…&fail=500` / `fail=html` / `fail=timeout` | a broken upstream (HTTP 500, an HTML page, no answer) |
| `…&failAfter=2026-10-24T21:00:00Z` | the normal answer until then, then `fail` (500 by default) |
| `…&checkedAgo=70` | the pages' store as a good run that many minutes back left it (stale over 60, too old from 180) |

For the pages, a failing mock (`fail`, `failAfter`) is a store that cannot be read.

Locally: put `IMGW_WARNINGS_URL=mock:1809?level=2` in `web/.env.local` (and the `db:local` settings), restart `next dev`. On a preview: add the variable for that branch only (`vercel env add IMGW_WARNINGS_URL preview <branch> --scope gdzie-zamieszkac`), then redeploy; remove it afterwards. CI sets `mock:none`, so the built site never asks IMGW; `web/scripts/check-warnings.mjs` then checks every banner state on the built site, one server per state (`checkedAgo` for the stale and too-old states, `fail=500` for a store that cannot be read). Unit tests cannot reach the network at all (`web/scripts/lib/no-network.mjs`, loaded by `npm test`).

**Never in production.** When `VERCEL_ENV` is `production` (Vercel sets it on every production function), `upstream()` ignores a `mock:` value, logs it, and uses the official endpoint. The mock module is loaded only after that check, and itself refuses to answer in production. There is no mock route or URL to reach. Both are covered by unit tests (`upstream: … the mock is refused in production`, `the mock … never in production`).
