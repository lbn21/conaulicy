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

No public endpoint (task 98: `/api/warnings` was removed). Every page but the address pages renders `ImgwBanner`, a Server Component, at the top of `<main>` (task 104: each page draws it, no longer the root layout). The address page (`/adres/<id>`, `components/hub.tsx`) shows the same warnings, from the same copy and filter, in „Najbliższe dni” (a line each, „Teraz:” or when it starts, its tag, until when; the relative words picked by the client island, `components/upcoming.tsx`, so a cached copy never says „Teraz” after the end) and in its „Pogoda” section (event and tag, then its day and hours, absolute), or „Brak ostrzeżeń IMGW dla powiatu lubaczowskiego.”; its subpages (`/smieci`) show none. On every other page: GOV.UK's notification banner (neutral, `role="region"`, `aria-labelledby`, govuk-frontend 6.5.1's markup) in a two-thirds column, before the page's own row, so before its h1 (and its caption, error summary or JSON-LD, where a page has them). No client JS. The brand colour is our palette's (Wiśnia).

Warnings are powiat-wide, so every page shows the same banner (powiat `1809`, `POWIAT` in `lib/imgw-banner.ts`). Those in force or to come, highest level first, then by start; one banner, compact (task 98: 163 px at 375 px for one warning, 273 px for three):

- title „Ostrzeżenie IMGW” / „Ostrzeżenia IMGW”;
- visible, one line per warning (a list when there are several): the event, a tag „Stopień N z 3” (IMGW's own solid level colours #ffbe00 / #ff5a00 / #d60000, from `lvlToColorOsmet` in shared.imgw.pl's warnings widget, `WARNING_LEVELS` in `web/lib/palette.ts`; black text on 1 and 2, white on 3; the text says the level too) and „do niedzieli 25 października, 19:00” (in force) or „od niedzieli 25 października, 13:00” (to come);
- visible, after the lines: „Źródło: IMGW-PIB” (govuk-body-s); the full two-sentence attribution stays in the details' footer;
- then GOV.UK's details (native `<details>`, closed, no JS), „Szczegóły ostrzeżenia” / „Szczegóły ostrzeżeń”, holding per warning (headed „Silny wiatr – Stopień N z 3” when there are several) „Obowiązuje teraz, do niedzieli 25 października, 19:00.” or „Od niedzieli 25 października, 13:00 do 19:00.” (the end's day too when it ends another day), „Prawdopodobieństwo: 75%.” and `tresc` verbatim; then the link „Szczegóły i mapa na meteo.imgw.pl” and the footer: „Dotyczy całego powiatu lubaczowskiego. Stan na HH:MM.”, „Nowszych danych nie udało się pobrać.” when the copy is stale, and IMGW's two attribution sentences.

Nothing at all (no "no warnings" text) when there is no warning, the newest copy is 3 hours old or older, or anything fails; the failure is logged. No dismiss button, no `role="alert"`.

**Rendering.** Pages stay static/ISR: the root layout sets `revalidate = 600`, so every page is regenerated at most every 10 minutes (/ulice was 3600, the static pages had none). A warning that ends is dropped at the next render.

**Purged on a change (task 213).** ISR serves the first visitor after a quiet spell the old page (and regenerates it behind), so a rarely visited page could show a warning that was issued, changed or has ended hours late. So the feed's cache is tagged `IMGW` (`web/lib/headers.ts`), which every page reading it carries too (the banner's pages and the address pages: the same `imgwCopy`). The ZUK cron (`/api/cron/zuk`, every 15 minutes, no cron of its own) also runs `web/lib/imgw-cron.ts`: it fetches the feed as the pages do (`upstream`, `fetchFeed`), takes the signature of what the pages show for powiat 1809 at that moment (each warning `forPowiat` keeps, its id, level, probability, times, publication, event and text, and whether it is in force, by id), and compares it with the one stored by the last purge in the private Blob file `imgw/shown.json`. Different, or none stored: `revalidateTag("imgw", { expire: 0 })`, then the new signature is stored. A warning new, changed or removed, one that ended (`forPowiat` drops it at `validTo`) or started (in force from `validFrom`) changes it by itself, so no instants are computed; a change only for another powiat does not. IMGW down, a feed of the wrong shape or the Blob unreadable: logged, nothing purged, the stored signature kept, never the water run's result or the response's status (`imgw` in the cron's JSON). Purges are rare, but each drops the earlier copies kept as fallback too: if IMGW is down at that moment, the banner is left out until the next good fetch. Not changed: on a rarely visited page, „Sprawdziliśmy …” still says the page's ISR age, as no run without a change purges.

**Caching and last good.** Each copy of the whole feed is kept in Next.js's data cache (tagged `IMGW`, above), which every function instance shares, under its upstream and 10-minute slot (`unstable_cache`, kept 3 h 10 min). The first render in a slot fetches IMGW (5 s timeout); the rest read the copy, so IMGW sees at most about one request per 10 minutes. If the fetch fails, the previous 18 slots (3 hours) are read, without fetching, and the newest copy found is shown as stale; a copy 3 hours old or older is never shown. After a failure an instance leaves IMGW alone for a minute, so pages rendered per request (/szukaj) do not each wait for the timeout. A failing or slow IMGW never fails a build or a render.

## Configuration and the dev mock

`IMGW_WARNINGS_URL` (optional) sets the upstream; unset means the official endpoint. A value starting with `mock:` answers from the fixtures, through the same fetch, parse and cache path, without any network:

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

Locally: put `IMGW_WARNINGS_URL=mock:1809?level=2` in `web/.env.local` (and the `db:local` settings), restart `next dev`. On a preview: add the variable for that branch only (`vercel env add IMGW_WARNINGS_URL preview <branch> --scope gdzie-zamieszkac`), then redeploy; remove it afterwards. CI sets `mock:none`, so the built site never asks IMGW; `web/scripts/check-warnings.mjs` then checks every banner state on the built site, one server per state (a fake clock, `scripts/lib/fake-clock.mjs`, ages a kept copy for the stale states). Unit tests cannot reach the network at all (`web/scripts/lib/no-network.mjs`, loaded by `npm test`).

**Never in production.** When `VERCEL_ENV` is `production` (Vercel sets it on every production function), `upstream()` ignores a `mock:` value, logs it, and uses the official endpoint. The mock module is loaded only after that check, and itself refuses to answer in production. There is no mock route or URL to reach. Both are covered by unit tests (`upstream: … the mock is refused in production`, `the mock … never in production`).
