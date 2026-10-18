# Task 10 — „Mój adres” ETL: Lubaczów waste schedules → JSON + ICS + accuracy tests (owner: **Grok**)

## Changelog
- **18.10.2026, task-00 (binding).** Repo `lbn21/conaulicy`, code in `etl/` (not `moj-adres/etl/`). Read `docs/data/DATA-INVENTORY.md` and `docs/MVP-PLAN.md`. Seed data is `docs/data/`; the pipeline cache is `etl/data/raw/`. First release is waste schedules, the address register and ICS only. Do **not** build IMGW (`warnings.py`, `warnings.json`, or a warnings cron). The next release fetches IMGW in the Next.js route `/api/warnings` (see task-12).

Repo: `lbn21/conaulicy` (private), branch `feat/etl`, directory `etl/`. Python 3.12.
Read first: `docs/data/DATA-INVENTORY.md`, `docs/MVP-PLAN.md`. Seed data: `docs/data/` (copy the raw files into `etl/data/raw/` – they are public documents).
**Hard rules:** do not contact anyone (gmina, MZGKiM, PGE, FB admins); do not deploy; do not buy anything; no secrets in code or logs (mask env vars, never print tokens/API keys, `set +x` around anything secret); no scraping behind logins/WAFs, no reverse-engineering of eGmina BOM or PGE private endpoints; never invent a date. UI is NOT in scope (that is task-11, Opus 5.5).

## Scope (MVP v1)
1. Waste schedules 2026 for **Miasto Lubaczów** (5 JPG, sectors `miasto-s1..s5`) and **Gmina Lubaczów** (5 text PDFs, sectors `gmina-s1..s5`).
2. Address register (TERYT ULIC/SIMC) → sector mapping for autocomplete.
3. Output: JSON per sector + ICS per sector + `places.json` + a small `search-index.json` (diacritics-insensitive, for client-side search) + `meta.json`. Static files consumed by `web/`. No database.
4. Pipeline ready for 2027 schedules (expected: city ~mid-Dec 2026, gmina ~20.12.2026–10.01.2027; may be half-year only).
Out of scope for this release: IMGW warnings, water/power outages, email, RSO, other gminas. One data folder per gmina later; do not build that structure now.

## Steps
1. `fetch.py` — download sources listed in `sources.yaml` (URL, expected sha256, discovery query). Discovery: city `https://czystylubaczow.info/wp-json/wp/v2/media?search=harmonogram&per_page=100&_fields=date,source_url`; gmina `https://www.gminalubaczow.pl/wp-json/wp/v2/posts?search=odpad&_fields=date,link,title`. Polite: UA `MojAdresBot/0.1 (+contact URL on the site)`, ≤1 req/s, cache under `data/raw/{source}/{sha256}.{ext}`, idempotent.
2. `extract_gmina.py` — `pdftotext -layout` → deterministic parser (months STYCZEŃ…GRUDZIEŃ, 3 columns: `zmieszane+bio` | `selektywne` (tworzywa_metale, papier, szklo) | `wielkogabarytowe`; `-` = none; `"2,20"` = two dates). Village list from the left column (handles wrapped lines; S3 includes **Młodów**, which is not in the file name). **No LLM needed.**
3. `extract_miasto.py` — JPG (no text layer). Two independent passes:
   - Pass A: vision-LLM extraction into the schema below, with the cell layout (4 rows: `zmieszane+popiol`, `papier+tworzywa_metale+szklo`, `bio`, `wielkogabarytowe+elektro+opony+tekstylia`).
   - Pass B: OCR (tesseract `pol`) of the cropped table + street list, or a second, different model.
   - Pass A ≠ Pass B on any cell ⇒ status `needs_review`. Street list → split on commas → match to TERYT.
4. `review/` — **manual review step (mandatory for any AI-extracted date):** generate `review/{sector}-{year}.md` with the source image crop next to the extracted table + diff vs the seed `docs/data/sample/schedule-2026.sample.json`. A human (Jakub or Tech Lead) sets `approved_by` + `approved_at` in `review/approvals.yaml`. `build.py` **refuses** to publish a sector/year without approval (exit≠0). PDF-parsed gmina dates also go through approval, but with a lighter checklist.
5. `register.py` — TERYT: download the official full ULIC + SIMC (eTERYT „pliki pełne”, postback; see inventory §7), filter `WOJ=18 POW=09 GMI=01 RODZ=1` and `GMI=04 RODZ=2`. Matching rules: normalise (lowercase, strip diacritics/punctuation, strip prefixes gen./ks./mjr./rtm./płk./kard./abp./prof./dr/het./św./księcia/wojewody), match `NAZWA_2 + NAZWA_1` or `NAZWA_1`; explicit `aliases.yaml` (`Monte Casino→Monte Cassino`, `Józefa Conrada-Korzeniowskiego→Józefa Conrad-Korzeniowskiego`, `Jagiellonów→os. Osiedle Jagiellonów`). Village parts (SIMC RM 00/03) inherit the sector of `SYMPOD` and carry `mapping:"via_parent"`. Streets in TERYT but in no sector → `sector:null` (UI shows "brak danych", **never guess**). Expected (my run): 192/192 city schedule names matched, 14 TERYT city objects unassigned, 24/24 parent villages assigned.
6. **IMGW — do not build.** Next release only: `GET /api/warnings` in `web/` (not this Python package) fetches `https://danepubliczne.imgw.pl/api/data/warningsmeteo` with `revalidate = 600` and `Cache-Control: s-maxage=600, stale-while-revalidate=3600`. Handle both an array and `{"message":"Brak ostrzeżeń meteorologicznych"}`. Keep warnings whose `teryt` list contains `1809` (confirm the field on the first live sample). On upstream failure serve the last good payload with `stale: true`. Keep the IMGW attribution sentence from `docs/data/DATA-INVENTORY.md`. No GitHub Actions cron.
7. `build.py` → `dist/data/`:
   - `places.json` (autocomplete; ≤150 KB gz): `[{id, label:"ul. Adama Asnyka, Lubaczów", kind:"street|village|village_part", sym, sym_ul?, gmina, sector|null, parent?}]`.
   - `sector/{sector}.json`: see schema.
   - `ics/{sector}.ics` (RFC 5545): one all-day `VEVENT` per date per pickup group; `SUMMARY` in warm Polish, e.g. „🗑️ Zmieszane i popiół – wystaw do 6:00” (gmina PDF: „wystawić przed posesję w dniu wywozu do godz. 6:00”; for the city, use only the wording confirmed by the source, no invented hours); `DESCRIPTION` with source URL + „Wersja z dnia …”; `UID = sha1(sector|date|group)@<domain>` (stable across rebuilds); `DTSTAMP` = build time; `X-WR-CALNAME`, `X-WR-TIMEZONE:Europe/Warsaw`, `REFRESH-INTERVAL;VALUE=DURATION:PT12H`, `X-PUBLISHED-TTL:PT12H`; `VALARM` (`TRIGGER:-PT6H` = 18:00 the evening before). Note in the README: Google Calendar ignores VALARM for subscribed calendars and refreshes slowly (up to ~24 h) — the UI copy should mention it.
   - `meta.json`: `{built_at, sources:[{url, sha256, downloaded_at, published_at}], approvals}`.

### Sector JSON schema (`schema/sector.schema.json`, JSON Schema 2020-12)
```json
{"sector":"miasto-s1","unit":{"teryt":"1809011","name":"Lubaczów (miasto)"},"year":2026,
 "valid_from":"2026-01-01","valid_to":"2026-12-31","contractor":"EMPOL Sp. z o.o.",
 "pickups":[{"date":"2026-01-12","group":"zmieszane","fractions":["zmieszane","popiol"],"label":"Zmieszane i popiół"}],
 "source":{"url":"https://czystylubaczow.info/wp-content/uploads/2025/12/harmonogram-2026-s1.jpg","sha256":"…","published_at":"2025-12-15","method":"vision+ocr","approved_by":"…","approved_at":"…"},
 "flags":["S2_S3_identical_in_source"],"notes_pl":["…"]}
```
Fraction enum: `zmieszane, popiol, bio, papier, tworzywa_metale, szklo, wielkogabarytowe, elektro, opony, tekstylia`.

## Tests (`pytest`, run in CI)
- Schema validation of every output; ICS validated with `icalendar` parse + `python-ics`/`icalvalidator` round-trip; no duplicate UIDs.
- **Accuracy (release gate): for one full sector-year, 100% match with the source.** Required: `gmina-s1-2026` (PDF) **and** `miasto-s1-2026` (JPG) compared against a hand-checked golden file `tests/golden/{sector}-2026.json` (create it by reading the source cell by cell; my seed transcription in `docs/data/sample/` is a starting point, NOT the golden truth). Any mismatch = test failure. Also report pickup-date counts per sector and group. My seed transcription gives: `miasto-s1` = 64 (zmieszane+popiół 26, segregowane 15, bio 21, gabaryty 2), `gmina-s1` = 33 (zmieszane+bio 19, segregowane 12, gabaryty 2). Confirm against the source; do not hard-code these numbers unchecked.
- Weekday sanity: list each date whose weekday ≠ the sector's modal weekday (expected ~44 for 2026, see `docs/data/sample/weekday-anomalies.txt`) — each must be explicitly acknowledged in `review/approvals.yaml` (holidays: 01.01, 06.01, Easter Monday 06.04, 01.05, Corpus Christi 04.06, 15.08, 01.11, 11.11, 24–26.12.2026).
- S2 vs S3 (city): test asserts they are identical AND that the flag `S2_S3_identical_in_source` is set (so we remember to confirm).
- Register: every schedule street matched exactly once; no TERYT street in 2 sectors; unassigned list printed.
- IMGW parser fixtures belong to the next release (`/api/warnings`), not this task.
- Determinism: two builds from the same inputs produce byte-identical files (except `DTSTAMP`/`built_at`).

## Acceptance criteria
- [ ] `make etl` from a clean checkout runs in < 10 min, uses the cache, exit 0.
- [ ] 10 sector JSON + 10 ICS files for 2026; `places.json`; `search-index.json`; `meta.json`. No `warnings.json`.
- [ ] Golden tests: 100% match for `gmina-s1-2026` and `miasto-s1-2026`; human-approved review for all 10 sectors.
- [ ] Every published date traceable to a source URL + sha256; no date without approval; zero invented values.
- [ ] ICS imports cleanly in Google Calendar (subscribe by URL), Apple Calendar (webcal) and Outlook.com — screenshots in the PR (from a preview URL provided by task-12, behind Basic Auth: use a test account; if the subscription cannot pass Basic Auth, test with file import and document it).
- [ ] `README.md`: sources & licences (art. 4 pr. aut.; ustawa o otwartych danych 2021; IMGW attribution sentences verbatim), how to add the 2027 schedule, how to approve a review.
- [ ] No secrets, no personal data, logs free of tokens. PR to `main`, do not merge.
