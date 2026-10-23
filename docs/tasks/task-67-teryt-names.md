# Task 67: TERYT names as the single source of truth, and search ranking from TERYT type

Jakub approved this as a proper fix, not a patch. Branch `feat/teryt-names`, one PR to `main`.

## Hard rules (unchanged, repeat them to yourself)

- NO `npm run db:*`, NO `db:import`, NO `import:*` against anything but a throwaway local Postgres. NO local `next build` or anything that reads `web/.env.local` (it is production Neon).
- A schema change is a migration file in `web/drizzle/` (via `drizzle-kit generate` with NO database connection) that CI applies to its throwaway Postgres. Production migration and production data reload are NOT yours: they are run by Jakub after merge (docs/database.md). So the code you ship must keep working on the CURRENT production schema and data until then (see "Deploy order").
- No force-push to main. Stop on any safety block; never rephrase or split an action to get around one. Never touch `~/projects/conaulicy`.
- Generic rules only. No per-street, per-place or per-gmina exception lists anywhere.

## Facts (verified, cite them in code comments where useful)

- GUS, implementation rules for TERYT dictionaries:
  https://eteryt.stat.gov.pl/eTeryt/rejestr_teryt/udostepnianie_danych/zasady_implementacji_slownikow/zasady_implementacji_slownikow.aspx
  - SIMC id is unique and never changes (not on rename, type or admin change).
  - ULIC id (SYM_UL) identifies the street NAME, not the street: the same name+cecha has the same SYM_UL in every locality; a different cecha is a different id. A rename gives a different SYM_UL.
  - Full name = CECHA + NAZWA_2 + NAZWA_1, in that order. NAZWA_1 is the key part (alphabetical position); NAZWA_2 the beginning (e.g. "Adama").
  - The ULIC catalogue is updated daily.
- Update-file structure (changes D/M/U/Z, with id/cecha/nazwa before and after, and "merged into" ids):
  https://eteryt.stat.gov.pl/eTeryt/rejestr_teryt/udostepnianie_danych/baza_teryt/uzytkownicy_indywidualni/pobieranie/pliki_aktualizacyjne_struktury.aspx
- Full files (public, free, no login, ASP.NET form): https://eteryt.stat.gov.pl/eTeryt/rejestr_teryt/udostepnianie_danych/baza_teryt/uzytkownicy_indywidualni/pobieranie/pliki_pelne.aspx
  (already the source in `etl/sources.yaml:211-223` and `docs/data/sources.md:34-36`; files of 2026-10-18, STAN_NA 2026-10-16).
- TERYT ws1 (SOAP, free, needs an account by email to teryt_ws1@stat.gov.pl, 99.0 % availability): https://api.stat.gov.pl/Home/TerytApi . Do NOT register or email anyone; that is Jakub's call.
- GUGiK UUG (https://services.gugik.gov.pl/uug/opis.html) is PRG-based, not TERYT: it lacks 5 of our TERYT streets and spells one differently ("Ppłk." vs TERYT "Ppłk"). Do not use it as the name source.
- Today: `streets.prefix` already holds CECHA and `streets.name` holds "NAZWA_2 NAZWA_1" joined (ETL `etl/register.py:31-32,187-188` on branch feat/etl). NAZWA_1 / NAZWA_2 are not stored separately. Our 273 street labels match the 2026-10-16 ULIC file; all 330 ids are pure TERYT (273 `SIMC-SYM_UL`, 57 `SIMC`), no suffixes. ICS is per zone (`app/ics/[zoneId]`), so calendar subscriptions do not depend on street ids.

## Part A: search ranking from TERYT type (ship first; no schema change needed)

1. The search index carries the TERYT type: `SearchIndex` becomes `Array<[id, label, type]>` where `type` is `streets.prefix` (CECHA, e.g. "ul.", "os.", "al.", "pl.") for streets and the locality kind for villages/parts (`localities.kind`). Build it in `web/lib/schedule.ts` `searchIndex` (rows already have `prefix`). Keep the index small (it is ~4 KB gzip; adding type should cost well under 0.5 KB gzip). Update `/api/search-index`, the field, `/api/search`, `/szukaj`, `/ulice`, the sitemap and fixtures that use the tuple.
2. `web/lib/search.ts`: stop inferring type from label words (`osiedle: words[0] === "osiedle"`, line 244). Use the index type. Map CECHA to its spoken word(s) once, from the TERYT CECHA list (ul., al., pl., skwer, bulw., rondo, park, rynek, szosa, droga, os., ogród, wyspa, wyb.), reusing/merging `PREFIX_WORDS` in `web/lib/places.ts:54-60` so there is ONE table.
3. Rule "a bare name means a street" (Polish addressing convention; GUGiK UUG also lists the street before the osiedle for a bare name): a place whose type is not "ul." and whose type word the user did NOT type drops behind equally good matches. Implement as a sort tie-break placed right AFTER the `part` tie-break in `rank()` (currently `search.ts:182`), NOT inside the key, so `clear` and `/szukaj` behaviour stay the same (a bare "Mickiewicza" still lists both; "ul. Mickiewicza" and "os. Mickiewicza" still 308). Replace the existing `street && place.osiedle` key slot with the same type logic generalised: typed "ul."/"ulica" pushes non-"ul." places down in the key as today.
   Prototype result (on a box copy): all 12 existing tests green; of 360 single-word queries only "Mickiewicza" changes its top hit. Placing it before `part` broke "Sama", so keep it after.
4. Add synonyms `pl` -> `plac` (and any other CECHA abbreviations from the table) so typed abbreviation and full word match each other.
5. Fix the "Sama" quirk generically: `size` (town size tie-break, `search.ts:231-235`) is 0 for every label with "(" so villages lose to an osiedle in that village. Compute size from the place's town/village identity (street: its locality; village: itself; part: its parent village), not from label text after the comma.
6. Tests (`web/lib/search.test.ts`), add order-asserting cases:
   - "Mickewicza" and "Mickiewicza" -> first is "ul. Adama Mickiewicza, Lubaczów", second the osiedle, `clear` false.
   - "os. Mickiewicza" / "osiedle mickiewicza" -> osiedle, clear.
   - "Sama" -> "Krowica Sama (gm. Lubaczów)" first.
   - "Unii Lubelskiej" -> street first; "al. Jaworskiego" -> aleja.
   - Fix ambiguous expectations at lines 46-48 (expected "Mickiewicza, Lubaczów" matches both labels): use the full street label.
   - Keep tuning >= 95 %, held-out >= 85 % (currently 62/62, 30/30), the 330-place parity and exact-label tests, the perf test, and every other battery green. Update `search-fixture.ts` to the new tuple from real TERYT types.

## Part B: TERYT fields stored, labels built from them (code + migration; production apply is Jakub's)

1. Migration (generated offline): `streets.nazwa_1 text`, `streets.nazwa_2 text` (nullable at first so current production keeps working), keep `prefix` as CECHA. Localities already store SIMC (`teryt`) and name.
2. ETL / import (`web/scripts/lib/import-data.ts`, the Etl type, CI fixture, `scripts/ci-fixture.ts`): carry CECHA, NAZWA_1, NAZWA_2, SIMC, SYM_UL from the official ULIC/SIMC files; labels built ONLY from them, in the official order (`streetName` in places.ts, with the existing rule for names whose first word repeats the cecha, as GUS describes). Code must fall back to the current `name` when `nazwa_1` is null, so deploy before migration is safe.
3. Search can then also index NAZWA_1 as the key word (optional: only if it improves a test; do not add weight hacks).

## Part C: TERYT sync check (flag, never auto-apply)

Waste zones map by street name, so a TERYT change must be reviewed by a human.

1. A script `web/scripts/check-teryt.ts` (+ unit tests with saved fixtures) that, given the latest ULIC and SIMC files for our gminy (TERC from `etl/sources.yaml`, today 1809011 and 1809042, so it works for future gminy), diffs them against our places by id and reports: new street (D), renamed/re-typed/moved (M, Z: id or cecha or nazwa change), removed/merged (U, with "merged into"), new/renamed localities. Prefer the official update files (structure above) when available; otherwise diff full files.
2. Wire it into the existing import workflow (`.github/workflows/import.yml`, `web/scripts/import/core/issues.ts` mechanism) so a change opens/updates ONE review issue; it must not write places. If fetching from eTERYT needs the ASP.NET form, implement it read-only and politely (once per run, archive the file to S3 like other sources); if it cannot be done reliably, stop and report, and propose TERYT ws1 for Jakub to decide. Do not register for anything.
3. Since a rename gives a new SYM_UL, the page id `SIMC-SYM_UL` changes on rename. Add a table `place_redirects (old_id text primary key, new_id text not null, reason text, created_at)` (migration), filled ONLY by the reviewed step (a documented manual command or approved import change, never automatically). `/adres/<old>` and its sub-routes (`/harmonogram.pdf`, `/nr/...`, `/numer`) answer a permanent 308 to the same path on the new id, query kept. Add tests (unit + route check in CI fixture). Unknown ids keep the current 404.
4. Docs: add to `CLAUDE.md` a standing rule: "TERYT (GUS ULIC/SIMC) is the single source of truth for place and street names and types, for every gmina; names from gmina PDFs/schedules are mapped TO TERYT, never the other way." Update `docs/data/DATA-INVENTORY.md` section 7 and `docs/database.md` (new columns/table, production order).

## Deploy order (write it in the PR description)

1. Merge: code works on current production schema (Part A live immediately; Part B/C code tolerant of missing columns/table, or gate the reads so missing table = no redirects).
2. Jakub, after merge: back up, `db:migrate` on production, `db:import --apply --yes-production` (per docs/database.md). Agents never do this.
If keeping the code tolerant makes Part B/C too tangled, split: PR 1 = Part A + Part C script/tests + docs; PR 2 = migrations + ETL fields + redirects. Say which you chose.

## Done when

- CI green; all batteries above green; PR description lists: queries checked, index size before/after (gzip), the TERYT diff output against the current 2026-10-16 files (expected: no changes), and the deploy order.
- Do not merge yourself; stop and report the PR URL.
