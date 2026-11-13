# PGE power outages

What the site reads from PGE Dystrybucja's PowerOutage API and how, and where it shows it: on the address page (a row per outage in „Najbliższe 7 dni”) and on its subpage `/adres/<id>/prad`. Code:

- `web/lib/pge-feed.ts`: fetch, parse, area, file;
- `web/lib/pge-cron.ts`: the cron step;
- `web/lib/power-module.ts`: what an address shows;
- `web/lib/place-match.ts`: the matching rule, shared with water.

The row and the subpage are the water's, made generic: `web/components/rows/outage.tsx`, `web/components/outage-page.tsx` and `web/lib/outage-view.ts`. Fixtures are in `web/lib/pge-fixture.ts`; the dev mock is `web/lib/pge-mock.ts`.

## Endpoint and limits

`GET https://power-outage.gkpge.pl/api/power-outage?regionIdentifier=49` (PowerOutage API 1.0.1), header `X-Auth-Token: $PGE_API_TOKEN`.

- **Region:** 49 is RE Tomaszów Lubelski, which covers both our gminas.
- **Token and limit:** the token is personal, limited to 60 requests an hour, and set in Vercel by the Tech Lead. Nobody else holds it, and it is never logged or put in a message.
- **Requests:** one per cron run, with a 10 s timeout and no retries. That is 4 an hour, leaving room for a manual `curl` of the cron.
- **Terms:** PGE's docs say using the API is free, and that it is meant for local portals and administration to publish outage notices.

The answer is a JSON array. `[]` means there are no outages, and it is valid. Every other answer is an upstream failure:

- something that is not an array (an object, or HTML that does not parse);
- a non-2xx status;
- a timeout.

## Fields

| Field | Use |
|---|---|
| `uuid` | `uuid` |
| `type` | 2 is `planned` (the default the API lists), 1 is `failure`; any other type skips the item and is logged |
| `dateRanges[]` | `ranges`: when the power is really off. One outage can have two (08:00–09:00 and 19:00–20:00) |
| `startAt`, `stopAt` | used only when `dateRanges` is missing or empty, as one range. That is longer than the real off-time, the safe side, and it is logged (`no-date-ranges`) because `dateRanges` is undocumented |
| `revoked`, `revokedDescription` | `revoked`, `revokedNote` |
| `addresses[].teryt.citySym` | `simc` (7 digits) |
| `addresses[].teryt.streetSymUl` | `ulic` (5 digits), or null when PGE names no street |
| `addresses[].numbers` | `numbers`: PGE's list as given, never parsed |
| `updatedAt`, else `createdAt` | `updatedAt` |

Nothing else is kept. Not `coordinates`, and not PGE's names (`cityName`, `streetName` „ul. Czereśnie”): the pages name places from TERYT, per the TERYT rule. A malformed item is skipped and logged, and never fails the feed. Malformed means a bad time, no uuid, an end not after its start, or an address without a valid SIMC or ULIC.

## Times

The API's times carry no zone. They are Warsaw wall time (`Y-m-d H:i:s`), read with `warsawToIso` as IMGW's. In the doubled hour (the last Sunday of October), a start takes the earlier instant and an end the later one, so an outage is never shown shorter than announced. A time skipped in March moves forward an hour.

## Area

An address is ours when its `citySym` is one of our TERYT localities (`ZUK_PLACES`: both gminas' town, villages and village parts). If its street is not in our ULIC snapshot for that SIMC, the address is dropped and logged (`street-unknown`, codes only), so a stale snapshot shows in the logs. An outage is kept when at least one address is ours, and only our addresses are kept. `communeCode` is not used: PGE drops TERYT's type digit, so 180901 and 180904 are ambiguous across gminas.

## Matching an address

There is one rule for water and power (`matches`, `web/lib/place-match.ts`). An address applies to a place when its locality is the place's locality and either PGE names no street, or names the place's street. A locality's own page also gets its streets' outages. A village part also gets its village's street-less outages, as water's cuts.

- **House numbers are shown, never filtered.** PGE's lists are enumerations with junk (`"., 0, 3/1, DZ 17/18, SKLEP"`, `"46i 48"`, `"100119"`), and say nothing about numbers that are absent (new houses, plots). Water filters by number because its ranges are written by people („23–47”) and parse cleanly. Here, a hidden outage is the expensive error.
- **The timeline row** says where (TERYT names) and, when PGE lists numbers, „tylko pod niektórymi numerami – sprawdź w szczegółach”. It never prints the list.
- **The subpage** prints the list verbatim under „Numery domów według PGE”. Several places in one outage are each named, with „PGE nie podaje numerów” where PGE gives none.

## Failures and revoked notices

- **A failure past PGE's estimated end:** while PGE still lists it, it is on. Its end is shown as „ok. HH:MM” (an estimate), and it lasts at least until 15 minutes after the last good check (`FAILURE_MARGIN_MS`). This one rule applies to every failure.
- **Revoked:** never in the timeline. On `/prad` it stays, with a grey tag „Odwołane” and PGE's note, until its time is over. Someone who saw it earlier can then see it was called off.
- **An item gone from the feed** is gone from the site. It is a live feed with no history, as IMGW's.

## The cron and the store

The ZUK cron (`/api/cron/zuk`, every 15 minutes) runs PGE as one of its live steps, beside IMGW. It has no cron of its own. Each live step is `{ key, run }` (`handleZukCron`, `web/lib/zuk-cron.ts`), with its own catch and its own key in `status/checks.json`. Both run through one step runner (`runLiveFeed`, `web/lib/live-cron.ts`): fetch, keep ours, then write `pge/outages.json` (`{ version, fetchedAt, items }`) only when the items changed.

A failure leaves the file as it was and records `pge: { ok: false, attemptAt }`, keeping `checkedAt`. The log names the class:

- `auth-error`: 401/403, or no token, in which case nothing is sent. This is the one to alert on.
- `rate-limited`: 429.
- `fetch-error`: anything else.

The pages never ask PGE. They read the file and the status file per request, through the Blob's CDN (`pgeCopy`, `web/lib/live-store.ts`). A good run shows within about 60 s, and a new outage is on the site at most about 16 minutes after PGE publishes it. Vercel Cron runs only on production, so Previews never spend the quota.

## Honest states

These follow IMGW's rule (`liveNotice`, `web/lib/live-status.ts`). The notice goes in the address page's inset and on `/prad`, followed by „Aktualne znajdziesz na stronie PGE Dystrybucja.”:

- **over 60 minutes:** the outages still shown, with „Nie udało się teraz pobrać danych PGE. Pokazujemy ostatnie dane z 9:52.”;
- **from 3 hours:** no outage shown, only „Od 9:52 nie udało się nam pobrać danych PGE, więc ich nie pokazujemy.”;
- **store unreadable:** „Nie udało się teraz sprawdzić przerw w dostawie prądu.”, and no PGE time in the small print;
- **no file yet:** „Nie udało się sprawdzić przerw w dostawie prądu.” (`unchecked`).

## Attribution

PGE Dystrybucja is credited on `/prad`'s source line: „Źródło: PGE Dystrybucja.”, then the freshness line („Bez zmian od …”, when PGE's items last changed). It links PGE's public page of current outages, https://pgedystrybucja.pl/wylaczenia/aktualne-przerwy-w-dostawie-energii (`PGE_PAGE`, `web/lib/power-module.ts`), the „Aktualne przerwy w dostawie energii” link in pgedystrybucja.pl's own menu. `/o-projekcie` links it too.

## Configuration and the dev mock

- **`PGE_API_TOKEN`:** the token. Unset means no request is sent, and every run is a failure.
- **`PGE_API_URL`** (optional): a base URL; unset means `https://power-outage.gkpge.pl`. A value starting with `mock:` answers from the fixtures through the same fetch, parse and file path, without any network. That covers the cron's fetch (a token is still needed: without `X-Auth-Token` the mock answers 401, as PGE does) and the pages' two files (`mockFiles`). Neither needs Blob.

| Value | Answer |
|---|---|
| `mock:none` | `[]` |
| `mock:real` | the real region-49 list of 11 Nov 2026, trimmed to 7 items (5 in gmina Lubaczów, one in Oleszyce, one Cieszanów street), verbatim without `coordinates`; past after 20 Nov |
| `mock:ours` | **derived, not real**: those items with one revoked, one without `dateRanges`, and a real Rzeszów failure moved to ul. Adama Asnyka (23, 52, 58A) and ul. Jasna in Lubaczów, moved to now. The planned ones move by whole days so the first is tomorrow; the failure began in the hour before this one |
| `…?fail=500` / `401` / `429` / `html` / `timeout` | a broken upstream |
| `…?checkedAgo=70` | the pages' store as a good run that many minutes back left it (stale over 60, too old from 180) |

For the pages, a failing mock is a store that cannot be read. When `VERCEL_ENV` is `production`, `upstream()` ignores a `mock:` value, logs it and uses the official URL, and the mock refuses to answer.

CI sets `PGE_API_URL: mock:ours`, so the built site never asks PGE (and `MZGKIM_MOCK: "5237"`, MZGKiM's fixture cut moved to the day after tomorrow on the same town street, `web/lib/water-fixture.ts` `mockFile`, gated as PGE's mock: off in production, `web/lib/zuk-store.ts`; so `/woda` there has its actions and calendar), and the a11y, HTML, zoom, title and route checks see a power row on the town street's address page and on its `/prad`. The village's `/prad` (`/adres/0606010/prad`) is the empty state. Unit tests cannot reach the network (`web/scripts/lib/no-network.mjs`).

The raw responses of 11 Nov 2026 are not in git. They are to go to the S3 source archive (`etl/sources.yaml`, origin `pge`) when the Tech Lead uploads them.

## Not done (v1)

- **No `prad.ics`:** failures would churn calendar feeds. `/adres/<id>/prad.ics` is a 404.
- **No „Twój numer jest na liście PGE”:** the site has no house numbers (t416).
