# IMGW meteo warnings

What the site reads from IMGW-PIB and how (task 97) and where it shows it: only on the address page and its `/pogoda` subpage (tasks 257, 263; the banner on every other page, task 98, is gone). Code: `web/lib/imgw-warnings.ts` (feed), `web/lib/imgw-shown.ts` (which warnings are shown, the notice), `web/lib/weather-module.ts` (their items and notice on the address page), `web/components/weather-page.tsx` (`/pogoda`); fixtures: `web/lib/imgw-fixture.ts`; dev mock: `web/lib/imgw-mock.ts`. Hydro warnings are out of scope (no powiat code, `DATA-INVENTORY.md` §5).

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

The regulamin §5 requires, wherever the data is used, the source sentence, and for processed data also the processing sentence. We filter and convert times, so both. They live in `IMGW_ATTRIBUTION` (`lib/imgw-warnings.ts`), and the address page ends with both, verbatim, as secondary text after its sections (task 205):

> Źródłem pochodzenia danych jest Instytut Meteorologii i Gospodarki Wodnej – Państwowy Instytut Badawczy.
>
> Dane Instytutu Meteorologii i Gospodarki Wodnej – Państwowego Instytutu Badawczego zostały przetworzone.

## On the address page

No public endpoint (task 98: `/api/warnings` was removed), and no banner (task 257, Jakub's decision): the warnings show only on the address page (`/adres/<id>`, `components/hub.tsx`) and its `/pogoda` subpage (task 263). `/smieci`, `/woda` and every other page show nothing of IMGW's.

Warnings are powiat-wide, so every address shows the same ones (powiat `1809`, `POWIAT` in `lib/imgw-shown.ts`): those in force or to come (`shownWarnings`), highest level first, then by start.

- **The address page's timeline** has a row per warning on each day it covers („Ostrzeżenie IMGW”: a tag „Stopień N z 3”, the event, from and until when, absolute; „trwa” on the days after its first), with „Szczegóły” to `/pogoda`. The tag uses IMGW's own solid level colours #ffbe00 / #ff5a00 / #d60000 (from `lvlToColorOsmet` in shared.imgw.pl's warnings widget, `WARNING_LEVELS` in `web/lib/palette.ts`; black text on 1 and 2, white on 3; the text says the level too). Never IMGW's own description there. Its source and last good check are in „Skąd to wiemy”, with IMGW's required wording.
- **`/pogoda`**: the checked line, then per warning, highest first, a GOV.UK summary card (the event; Stopień with its tag, Kiedy, Gdzie: „Cały powiat lubaczowski”, Opis IMGW: `tresc` verbatim and „Prawdopodobieństwo: 75%.”, `Intl.NumberFormat`); then the source in an inset, IMGW's only link on the page, with the required wording. With no warning and a fresh copy, one line: „Brak ostrzeżeń IMGW dla powiatu lubaczowskiego.” Never indexed (the powiat's, the same at every address). With no copy in the store yet, the address page and `/pogoda` say „Nie udało się sprawdzić ostrzeżeń IMGW.”

No client JS, no dismiss button, no `role="alert"`.

**Honest states (task 219): never silence while the feed file exists.** One rule, by the age of the last good check (`checkAge`, `web/lib/live-status.ts`; the constants are the water's too):

- over `STALE_MS` (60 min): a notice, with or without a warning, its link to meteo.imgw.pl (`weatherNotices`: in the address page's inset above the timeline; first on `/pogoda`): with warnings „Nie udało się teraz pobrać ostrzeżeń IMGW. Pokazujemy ostatnie dane z 9:52. Aktualne znajdziesz na meteo.imgw.pl.”, the warnings still listed; without „Nie udało się teraz pobrać ostrzeżeń IMGW. Ostatnie dane mamy z 9:52. Aktualne znajdziesz na meteo.imgw.pl.”, the notice alone;
- from `MAX_AGE_MS` (3 h): the old warnings are no longer shown (the timeline, `/pogoda`), the notice alone: „Od 9:52 nie udało się nam pobrać ostrzeżeń IMGW, więc ich nie pokazujemy. Aktualne znajdziesz na meteo.imgw.pl.”;
- the time is the day and time („z piątku 30 października, 9:52”) when the last data is not from today (Warsaw);
- the store cannot be read now: the notice alone, „Nie udało się teraz sprawdzić ostrzeżeń IMGW. Aktualne znajdziesz na meteo.imgw.pl.”, and no „Ostrzeżenia IMGW sprawdziliśmy” time on `/pogoda`.

Read per request, a page shows the notice as soon as the threshold has passed.

**The store unreadable at render: an expected error, returned as a value.** The read throws; `imgwCopy` catches it and returns `UNREADABLE` (`web/lib/live-store.ts`), which the weather module renders as the notice above. This is Next.js's documented pattern for expected errors: "model expected errors as return values", and in a Server Component "use the response to conditionally render an error message" (https://nextjs.org/docs/app/getting-started/error-handling#handling-expected-errors). The rest of every page renders as ever and keeps its status (200, or 404); no error boundary. Only the address pages read the copy (their 404 never does: an unknown place is answered before anything is read).

**Rendering.** The address page reads the copy per request, after `io()`, with every other block (`hubData`, `web/components/hub.tsx`; task 239), behind the page's one skeleton, so the warnings, the notice and the check time come from one read. Every other page is a static shell with no IMGW hole. A warning that ends is gone at the next view.

**The last good copy (task 219).** Pages never ask IMGW. The ZUK cron (`/api/cron/zuk`, every 15 minutes, no cron of its own) runs `web/lib/imgw-cron.ts`, the only fetch (`upstream`, `fetchFeed`, 5 s timeout): after a good fetch it writes the items for our powiats (`POWIATS`, `ours`) to the private Blob file `imgw/feed.json` (`{ version, fetchedAt, items }`, `feedFile`), **only when those items changed** (a few writes a day). A failed fetch, a feed of the wrong shape or a failed write leaves the file as it was; the run is then not a good check. A file that cannot be read or is not one is written afresh by the next good run.

**The status file.** Once at the end of every cron run, `handleZukCron` (`web/lib/zuk-cron.ts`, the one writer) writes `status/checks.json`: `{ version, sources: { [key]: { checkedAt, attemptAt, ok } } }`, one shape for every source key (`imgw`, `water:gmina-lubaczow`, `water:mzgkim`; `web/lib/live-status.ts`). A good try sets `checkedAt` (the last good check) to the run's start; a failed one keeps it and records `attemptAt` and `ok: false`. A line about several sources takes the oldest `checkedAt` of its keys (`oldestCheck`). A status file that cannot be read is started afresh; a failed write is logged, never the run's result.

**Read per request, through the Blob's CDN.** The weather module reads both files through `imgwCopy` (`web/lib/live-store.ts`) with no Next.js cache in front: `get(…, { access: "private", useCache: true })`, the Blob's CDN copy, at most 60 s behind a write (every file is written with `cacheControlMaxAge: 60`, the minimum; https://vercel.com/docs/vercel-blob). The cron reads the origin (`useCache: false`), so it compares with its last write. The copy's last good check is the status file's `imgw` entry, never older than the feed file's own `fetchedAt` (`imgwCopyOf`, `web/lib/imgw-shown.ts`).

**No purge.** Until 31 Oct 2026 every good check purged the `imgw` tag (tasks 213, 216); the pages now read the files per request, so nothing is purged and the tag is gone. A run's warnings show within 60 s of its write. IMGW down: logged, the pages keep showing the last good copy, and the notice once the threshold is past (above), never the water run's result or the response's status (`imgw` in the cron's JSON).

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

Locally: put `IMGW_WARNINGS_URL=mock:1809?level=2` in `web/.env.local` (and the `db:local` settings), restart `next dev`. On a preview: add the variable for that branch only (`vercel env add IMGW_WARNINGS_URL preview <branch> --scope gdzie-zamieszkac`), then redeploy; remove it afterwards. CI sets `mock:none`, so the built site never asks IMGW; `web/scripts/check-warnings.mjs` then checks every state on the built site's address page (each warning once, nothing of IMGW's on other pages), one server per state (`checkedAgo` for the stale and too-old states, `fail=500` for a store that cannot be read). Unit tests cannot reach the network at all (`web/scripts/lib/no-network.mjs`, loaded by `npm test`).

**Never in production.** When `VERCEL_ENV` is `production` (Vercel sets it on every production function), `upstream()` ignores a `mock:` value, logs it, and uses the official endpoint. The mock module is loaded only after that check, and itself refuses to answer in production. There is no mock route or URL to reach. Both are covered by unit tests (`upstream: … the mock is refused in production`, `the mock … never in production`).
