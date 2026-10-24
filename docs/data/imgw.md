# IMGW meteo warnings

What the site reads from IMGW-PIB and how (task 97). Code: `web/lib/imgw-warnings.ts`, `web/app/api/warnings/route.ts`; fixtures: `web/lib/imgw-fixture.ts`; dev mock: `web/lib/imgw-mock.ts`. Hydro warnings are out of scope (no powiat code, `DATA-INVENTORY.md` §5).

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

The regulamin §5 requires, wherever the data is used, the source sentence, and for processed data also the processing sentence. We filter and convert times, so both. They live in `IMGW_ATTRIBUTION` and every `/api/warnings` answer carries them:

> Źródłem pochodzenia danych jest Instytut Meteorologii i Gospodarki Wodnej – Państwowy Instytut Badawczy.
>
> Dane Instytutu Meteorologii i Gospodarki Wodnej – Państwowego Instytutu Badawczego zostały przetworzone.

## `GET /api/warnings?teryt=1809`

`teryt` must be one of our powiats, else `400` (JSON). Any other query parameter is redirected away (`lib/clean-query.ts`).

```json
{
  "state": "ok",
  "teryt": "1809",
  "fetchedAt": "2026-10-24T20:40:12+02:00",
  "stale": false,
  "warnings": [
    {
      "id": "Sk20261024094213061",
      "event": "Silny wiatr",
      "level": 1,
      "probability": 75,
      "validFrom": "2026-10-25T13:00:00+01:00",
      "validTo": "2026-10-25T19:00:00+01:00",
      "text": "Prognozuje się …",
      "office": "Centralne Biuro Prognoz Meteorologicznych w Warszawie",
      "published": "2026-10-24T11:42:00+02:00"
    }
  ],
  "source": {
    "url": "https://danepubliczne.imgw.pl/api/data/warningsmeteo",
    "attribution": ["Źródłem pochodzenia danych …", "Dane … zostały przetworzone."]
  }
}
```

Warnings are those in force or to come, highest level first, then by start.

| `state` | HTTP | `stale` | `warnings` | `Cache-Control` |
|---|---|---|---|---|
| `ok`: fetched in this 10-minute slot | 200 | false | list (maybe empty) | `public, s-maxage=600, stale-while-revalidate=3600` |
| `stale`: IMGW failed; the newest copy from the last hour | 200 | true | list | `public, s-maxage=60` |
| `unavailable`: IMGW failed and no copy from the last hour | 503 | false | `null` | `public, s-maxage=60` |

While the pre-launch gate is on, every answer is `private, no-store` (`lib/gate.ts`).

**Caching and last good.** Each copy of the whole feed is kept in Next.js's data cache, which every function instance shares, under its 10-minute slot (`unstable_cache`, kept 70 minutes). The first request in a slot fetches IMGW (5 s timeout); the rest read the copy, so IMGW sees at most about one request per 10 minutes. If the fetch fails, the route reads the previous six slots, newest first, without fetching, and serves the first copy it finds as `stale`. Nothing is in memory, so a cold instance falls back the same way.

## Configuration and the dev mock

`IMGW_WARNINGS_URL` (optional) sets the upstream; unset means the official endpoint. A value starting with `mock:` answers from the fixtures, through the same fetch, parse and cache path, without any network:

| Value | Answer |
|---|---|
| `mock:none` | the real "no warnings" object (18 Oct) |
| `mock:real` | the real 24 Oct feed, verbatim (nothing for 1809; its times are past after 25 Oct) |
| `mock:1809` | **derived, not real**: the 24 Oct feed with `1809` added to its podkarpackie warning, moved so it began an hour ago (level 1) |
| `mock:1809?level=3` | the same at level 1, 2 or 3 |
| `mock:1809?start=upcoming` | the same, starting in three hours |
| `…&fail=500` / `fail=html` / `fail=timeout` | a broken upstream (HTTP 500, an HTML page, no answer) |
| `…&failAfter=2026-10-24T21:00:00Z` | the normal answer until then, then `fail` (500 by default) |

Locally: put `IMGW_WARNINGS_URL=mock:1809?level=2` in `web/.env.local` (and the `db:local` settings), restart `next dev`. On a preview: add the variable for that branch only (`vercel env add IMGW_WARNINGS_URL preview <branch> --scope gdzie-zamieszkac`), then redeploy; remove it afterwards. CI sets `mock:none`, so the built site never asks IMGW. Unit tests cannot reach the network at all (`web/scripts/lib/no-network.mjs`, loaded by `npm test`).

**Never in production.** When `VERCEL_ENV` is `production` (Vercel sets it on every production function), `upstream()` ignores a `mock:` value, logs it, and uses the official endpoint. The mock module is loaded only after that check, and itself refuses to answer in production. There is no mock route or URL to reach. Both are covered by unit tests (`upstream: … the mock is refused in production`, `the mock … never in production`).
