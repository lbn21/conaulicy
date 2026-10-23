# „Mój adres” – data inventory (Miasto Lubaczów 1809011 + Gmina Lubaczów 1809042)

Checked: 18.10.2026, 22:48–23:05 (Europe/London, UTC+1). Read-only: nothing was sent, nobody was contacted, no logins.
Labels: **[F]** = verified fact (URL + archived file), **[S]** = assessment/opinion, **[OPEN]** = not finished, to do in task-10.

## 0. Archived files
In the private S3 bucket under `sources/<origin>/<fetch date>/`; keys, public URLs and SHA-256 in [sources.md](sources.md). `npm run sources:pull` puts them in `.cache/sources/`.

| Path | What it is |
|---|---|
| `miasto/2026-10-18/harmonogram-2026-s{1..5}.jpg` | city waste schedule 2026, 5 sectors, 3508×2482 JPG (original files) |
| `gmina/2026-10-18/{1..5}_2026_*.pdf` | gmina waste schedule 2026, 5 sectors, 1-page A3 PDF **with a text layer** |
| `miasto/2026-10-18/czystylubaczow_harmonogram.html`, `gmina/2026-10-18/gmina_harm2026.html` | the source pages as downloaded |
| `gmina/2026-10-18/gmina_woda_wp-api_sample.json` | the last 10 posts about water cuts (gmina WP REST API) |
| `mzgkim/2026-10-18/mzgkim_feed_2026-10-18.xml` | MZGKiM RSS (city water) |
| `imgw/2026-10-18/imgw_warningsmeteo_2026-10-18.json`, `imgw/2026-10-18/imgw_warningshydro_2026-10-18.json` | IMGW API snapshots |
| `rso/2026-10-18/rso_podkarpackie_2026-10-18.json` | RSO (komunikaty.tvp.pl) snapshot for podkarpackie |
| `teryt/2026-10-18/ULIC_1809011_miasto_lubaczow.csv` (206 streets), `teryt/2026-10-18/ULIC_1809042_gmina_lubaczow.csv` (70), `teryt/2026-10-18/SIMC_1809011_1809042.csv` (69 places) | TERYT subsets, version as of 2026-10-16 (ULIC) / 2026-01-01 (SIMC) |
| `meta/2026-10-18/build_sample.py` | **prototype** (not production): manual 2026 transcription → sample JSON + weekday check |
| `meta/2026-10-18/schedule-2026.sample.json` (486 events), `meta/2026-10-18/address-register.sample.json`, `meta/2026-10-18/weekday-anomalies.txt` | samples for task-10 / task-11 |

> The transcription in `build_sample.py` is my manual reading of the JPGs/PDFs. It is a **seed for the review**, not the source of truth. Task-10 must extract it independently and compare 1:1 (test plan §4 MVP-PLAN).

## 1. Waste schedules

### 1a. Miasto Lubaczów (Gmina Miejska) [F]
- Page: https://czystylubaczow.info/odbior-odpadow/harmonogram-odbioru-odpadow/ (run by MZGKiM / PSZOK, contractor **EMPOL Sp. z o.o.**, Tylmanowa, tel. 785 888 111, according to the JPG footer).
- Files: `https://czystylubaczow.info/wp-content/uploads/2025/12/harmonogram-2026-s{1..5}.jpg` (and `-scaled.jpg` in the WP media library). Uploaded **15.12.2025, 09:02–09:15 UTC** (WP API `/wp-json/wp/v2/media`).
- Format: **JPG graphic, no text layer**. One file = one sector. The street list sits at the top, with a 12-month × 4-row table below:
  1. `ZMIESZANE (NIESEGREGOWANE)` + `POPIÓŁ` (shared cell, 2–3 dates/month)
  2. `PAPIER I TEKTURA` + `TWORZYWA SZTUCZNE` + `OPAKOWANIA ZE SZKŁA` (shared cell, 1–2/month)
  3. `BIODEGRADOWALNE` (1–3/month)
  4. `WIELKOGABARYTOWE` + `ELEKTRYCZNE I ELEKTRONICZNE` + `ZUŻYTE OPONY` + `ODZIEŻ I TEKSTYLIA` (2× a year: March and September)
- Sectors = weekdays: S1 Mon, S2 Tue, S3 Tue (!), S4 Thu, S5 Fri, with shifts around holidays (list in `meta/2026-10-18/weekday-anomalies.txt`, see §0).
- ⚠️ **S2 and S3 tables are pixel-identical** (image diff = 0 px; the street lists differ). Either the two sectors really share dates, or this is a copy-paste error in the source. **[OPEN] Confirm** without contacting anyone: compare with the eGmina BOM app (open zone, by hand on a phone, Jakub) or with the 2025 schedules (`harmonogram-2025_01-06_s2.png` vs `_s3.png`). Until then, mark it as a "source flag" in the review.
- History of publication dates (WP media API) [F]: 2021: 31.12.2020 (Jan–Feb), 19.05 (Mar–Jun), 10.06 (Jul–Dec); 2022: 04.01 (H1), 30.05 (H2); 2023: 16.12.2022 (Jan–May), 31.05 (Jun–Dec); 2025: 17.12.2024 (**H1 only**); 2026: 15.12.2025 (whole year). ⇒ **The 2027 schedule will most likely appear in mid-December 2026** [S], and it may only cover half a year (that has happened 4 times). **2027 has not been published** (as of 18.10.2026) [F].
- Street → sector mapping: 192 street names from the JPGs, all matched to TERYT ULIC (189 automatically + 3 aliases: „Monte Casino”→Monte Cassino, „Conrada-Korzeniowskiego”→Conrad-Korzeniowskiego, „Jagiellonów”→os. Osiedle Jagiellonów). No street appears in 2 sectors [F].
- ⚠️ **14 TERYT streets are in none of the sectors** [F]: al. kard. Mariana Jaworskiego, ul. Gierymskiego, Ustronna, Działkowa, Kossaka, Łąkowa, Chełmońskiego, Grottgera, Podleśna, os. Mickiewicza, os. Unii Lubelskiej, 2 roundabouts, 1 square. Roundabouts and the square don't matter. The other 11 (new streets/estates) get the message „Nie mamy jeszcze tej ulicy – sprawdź w eGmina BOM / MZGKiM” and **no guessing** of a sector.
- Caveat: the source page itself says the schedule in eGmina BOM is „aktualizowany na bieżąco” (updated on an ongoing basis), so the JPG may go out of date when a date changes ⇒ change monitoring (§8).

### 1b. Gmina Lubaczów (wiejska) [F]
- Post: https://www.gminalubaczow.pl/2026/01/02/harmonogram-odbioru-odpadow-komunalnych-na-rok-2026/ (published 02.01.2026; contractor **F.H.U.P. MASTER Stanisław Cygan**; fee 23/28 zł per person per month).
- Files (`https://www.gminalubaczow.pl/wp-content/uploads/2026/01/`): `1_2026_Lisie_Jamy_Dabrowa_Szczutkow.pdf`, `2_2026_WolkaKrowicka_Budomierz_Krowica.pdf.pdf` (sic, double extension), `3_2026_BorowaGora_Karolowka_Hurcze_Opaka.pdf`, `4_2026_Basznie_Tymce_Podlesie_Huta_Krysz.pdf`, `5_2026_Mokrzyca_Zaluze_Piastowo_Antoniki_Balaje_Dabkow.pdf`. Created by PDF-XChange on 02.01.2026, A3, 1 page.
- Format: **text PDF**, parses cleanly with `pdftotext -layout`. Columns: `ODPADY KOMUNALNE ZMIESZANE I BIO` | selective (yellow plastics/metal, blue paper, green glass bags) | `WIELKOGABARYTOWE` (March + September). Village names are wrapped across lines in the left column.
- Sectors → villages (24 of 24 parent villages from SIMC are covered) [F]:
  - S1 (Mon): Lisie Jamy, Dąbrowa, Szczutków
  - S2 (Tue): Wólka Krowicka, Budomierz, Krowica Hołodowska, Krowica Sama, Krowica Lasowa
  - S3 (Wed): Borowa Góra, Karolówka, **Młodów** (in the PDF, not in the file name), Hurcze, Opaka
  - S4 (Thu): Basznia Dolna, Tymce, Basznia Górna, Podlesie, Huta Kryształowa
  - S5 (Fri): Mokrzyca, Załuże, Piastowo, Antoniki, Bałaje, Dąbków
- The 45 village parts / hamlets (SIMC RM 00/03, e.g. Moczar Duży → Załuże) are assigned through `SYMPOD` to their parent village (`mapping: via_parent`). That is an assumption [S], so mark it in the UI as „część wsi X”. Watch out: **two places called Dąbrowa**. 0606010 is a village (S1), and 0605967 is part of Basznia Górna (S4). Autocomplete has to show the parent village.
- ⚠️ Semantics of column 1 (zmieszane **and** BIO in one column, 1 date/month in winter, 2 in summer) are ambiguous [OPEN]. MVP copy: „zmieszane i bio” on every date, the same as the PDF says.
- Mid-year changes do happen [F]: posts such as „Informacja dot. częstotliwości odbioru odpadów zmieszanych” (02.04.2025, 07.11.2025) and „Zwiększenie częstotliwości odbioru odpadów zmieszanych” (01.04.2022) ⇒ monitor the posts as well, not just the PDFs.
- Publication history [F] (WP posts API): 20.12.2018, 31.12.2019/07.01.2020, 22.12.2020, 27.12.2022, 27.12.2023, 10.01.2025, 02.01.2026 ⇒ **2027 can be expected around 20.12.2026–10.01.2027** [S]. Not published yet [F]. A new tender/contractor can change the format.
- Gmina streets: TERYT ULIC has 70 streets in 6 villages (Basznia Dolna 9, Dąbków 14, Karolówka 5, Krowica Sama 1, Lisie Jamy 19, Młodów 22). The schedule works by village ⇒ for MVP, autocomplete accepts "village" or "village, street", and the sector comes from the village.

### Legality (both) [S, not legal advice]
Public information published by a public authority. Re-use is allowed by the Act of 11.08.2021 on open data and re-use of public sector information. An official document/material is not subject to copyright (art. 4 pkt 2 pr. aut.). No personal data. Obligations: give the source and download date for every item, link to the original, add "not an official service" and "in case of doubt the gmina announcement prevails".

## 2. eGmina BOM (BUK Softres sp. z o.o.) [F]
- City: https://um.lubaczow.pl/egmina.html says the app (Android/iOS) has an **open zone without login: news + waste collection dates**. Account/payments go through Profil Zaufany.
- Web version = eNależności (https://enaleznosci.lubaczow.pl, gmina: https://enaleznosci.lubaczow.com.pl/). It **requires login with Profil Zaufany** and covers liabilities and payments. I did not find a public web schedule, a feed, ICS or a documented API (on 18.10.2026).
- Decision: **we don't use it as a data source** (no public interface, and reverse-engineering the app is ruled out). We can only use it as a **manual cross-check** (Jakub opens the open zone on his phone and compares 5–10 dates, e.g. to settle S2 = S3).
- In the copy: „Masz eGmina BOM? Super – my dajemy dodatkowo kalendarz w telefonie bez instalowania aplikacji.” (We don't compete with the city.)

## 3. Water outages (v1.1)
| Unit | Source | Format | Frequency | Extraction |
|---|---|---|---|---|
| Gmina (ZUK Sp. z o.o. Mokrzyca) | gminalubaczow.pl posts, **public WP REST API**: `GET https://www.gminalubaczow.pl/wp-json/wp/v2/posts?search=przerwa%20w%20dostawie%20wody&_fields=date,link,title,content` [F] | HTML with a fixed template: „…w dniu DD.MM.RRRRr. (dzień) w godz. od HH:MM do godz. HH:MM nastąpi przerwa w dostawie wody dla mieszkańców miejscowości: X, Y, Z od nr A do nr B” [F] | in October 2026 almost daily (pipe modernisation >5 mln zł until about April 2027, per zlubaczowa.pl) [F]; usually published **1–3 days ahead** [F] | regex first (template), LLM fallback with evidence quote; granularity: village / street („Lisie Jamy: ul. Polna”) / house-number range |
| City (MZGKiM) | https://mzgkim.lubaczow.pl, **RSS `/feed/` works** [F]; WP REST API is **blocked** (401 Kadence Security) [F] – we don't work around it; robots.txt allows the site | post title is generic „Przerwa w dostawie wody” / „KOMUNIKAT!” / „Informacja”, streets as a list in the body [F] (e.g. 06.10.2026, 08:30–15:00: Sobieskiego, Niemirowska, Starzyny, osiedle Mazury) | a few per month [S] | RSS + fetch the post HTML, LLM extraction (date, hours, streets) → match to TERYT ULIC, **manual review** |
| Facebook (gmina/MZGKiM/ZUK) | — | — | — | **we don't scrape** (Meta ToS, login). We rely on the WWW, which carries the same notices [S] |
| zlubaczowa.pl | rewrites the notices | — | — | not a source (editorial content), at most a manual cross-check |

Legality: as in §1 (public notices of a municipal company / gmina; short facts + link). [S]

## 4. PGE Dystrybucja planned outages (v1.1) [F/OPEN]
- Page https://pgedystrybucja.pl/wylaczenia: **WAF blocks automated access**. curl from the box gives no response (000) and the fetcher gets „To działanie zostało odrzucone…” [F]. We **don't work around this** (no browser spoofing).
- An unofficial HA integration exists ([gregopl/PGE-Dystrybucja-Outages](https://github.com/gregopl/PGE-Dystrybucja-Outages)) that fetches outages for "miejscowość + ulica" [F]. That confirms locations are described per place/street, but it is a non-public endpoint ⇒ **ToS grey zone** [S].
- PGE has its own per-address notifications (newsletter, 991 Assistant app) [F, from lubaczow-strona.md].
- **Decision for v1.1** [S]: either (a) find an official PGE feed/RSS or permission (Jakub's decision, contact only with his approval), or (b) just show the link „Sprawdź wyłączenia prądu na stronie PGE” and direct people to PGE's newsletter. **No scraping that breaks the WAF.** [OPEN: read the PGE site terms in a normal browser, by Jakub or in the browser at task-10]

## 5. IMGW meteo/hydro warnings (v1) [F]
- `GET https://danepubliczne.imgw.pl/api/data/warningsmeteo` → on 18.10.2026 it returned `{"message":"Brak ostrzeżeń meteorologicznych"}` (**an object, not an empty list**, so the parser has to handle both shapes!) [F].
- `GET https://danepubliczne.imgw.pl/api/data/warningshydro` → a list of 94 objects, fields: `opublikowano, stopień, data_od, data_do, prawdopodobienstwo, numer, biuro, zdarzenie, przebieg, komentarz, …` (+ area) [F]. Hydro warnings are by catchment, not by powiat.
- Meteo warning fields (schema with the `teryt` list of powiat codes): **[OPEN]**, because I could not see a live example (no warnings). The monthly archive `https://danepubliczne.imgw.pl/data/arch/ost_meteo/2026/MM.zip` contains **PDFs**, not JSON [F]. Task-10: save the first non-empty response as a fixture and filter on `1809` (powiat lubaczowski).
- Terms (https://danepubliczne.imgw.pl/apiinfo, regulamin) [F]: free of charge, on condition that the source is given: **„Źródłem pochodzenia danych jest Instytut Meteorologii i Gospodarki Wodnej – Państwowy Instytut Badawczy”**, and for processed data also **„Dane Instytutu Meteorologii i Gospodarki Wodnej – Państwowego Instytutu Badawczego zostały przetworzone”**. Some data may be unverified, and IMGW is not liable. Contracts only for the data in §3 ust. 2 (not the API) [F]. ⇒ The footer of the site + the warning banner must carry these exact sentences.
- Frequency: poll every 30 min (GitHub Actions) [S]. A static site ⇒ the banner reads `warnings.json` generated by the ETL (up to ~30–60 min delay). That is acceptable for "warnings for today/tomorrow", but the banner text has to say „Sprawdź też meteo.imgw.pl”.

## 6. RCB / RSO alerts [F]
- `GET https://komunikaty.tvp.pl/komunikatyxml/podkarpackie/wszystkie/0?_format=json` → `{pagination, newses[]}`; fields: `id, title, shortcut, content, rso_alarm, valid_from, valid_to, river_name, location_name, provinces, created_at, updated_at…` [F]. On 18.10.2026: 12 items (hydrological drought in the San/Wisłok/… catchments).
- Location = voivodeship + text (catchment), **no powiat code** ⇒ precise filtering for Lubaczów is not possible without a rule set [S]. MVP: **left out** (IMGW is enough). v1.1+: display podkarpackie items with `rso_alarm=1` and a word filter („lubaczowsk”, „Lubaczówk”, the catchment of the Lubaczówka/San) – to be designed.
- Licence: public feed, no documented terms [OPEN]; the RCB SMS alerts are official and go to every phone anyway [S].

## 7. TERYT (the source of every place and street name) [F]
- **The single source of truth** for place and street names and types, for every gmina: names from gmina PDFs or schedules are mapped *to* TERYT, never the other way (`CLAUDE.md`).
- What we store: localities by SIMC (`localities.teryt`, an id that never changes), streets by SIMC + SYM_UL (page id `SIMC-SYM_UL`) with CECHA (`streets.prefix`), NAZWA_1 and NAZWA_2 (`streets.nazwa_1`, `streets.nazwa_2`); the shown name is NAZWA_2 + NAZWA_1 (`terytName`, `web/lib/places.ts`), and `db:import --teryt <dir>` takes all three from the ULIC files. SYM_UL names a street *name* with its CECHA (GUS, [zasady implementacji słowników](https://eteryt.stat.gov.pl/eTeryt/rejestr_teryt/udostepnianie_danych/zasady_implementacji_slownikow/zasady_implementacji_slownikow.aspx)): a renamed street gets a new one, so its page id changes, and `place_redirects` keeps the old address (`docs/database.md`).
- Source: GUS eTERYT, full files "urzędowy" (official version), https://eteryt.stat.gov.pl/eTeryt/rejestr_teryt/udostepnianie_danych/baza_teryt/uzytkownicy_indywidualni/pobieranie/pliki_pelne.aspx (public, no login, ASP.NET postback → `ULIC_Urzedowy_2026-10-18.zip` 8.1 MB, `SIMC_Urzedowy_2026-10-18.zip` 3.4 MB).
- Codes: Miasto Lubaczów = **18 09 01 1**, Gmina Lubaczów = **18 09 04 2** (not 02, that is Cieszanów!). City SIMC: Lubaczów 0972447 + parts Mazury, Niwki, Ostrowiec, Piaski, Zaprzekop.
- Licence: TERYT is public and re-usable (official register), give the source GUS + "stan na" date [S].
- Check: every apply run of the import workflow downloads ULIC and SIMC once (one GET, one POST per file) and compares them by id with our places for every configured gmina (`web/scripts/check-teryt.ts`): new (D), changed (M) or removed (U) streets and localities open one review issue, with our gminy's rows archived in S3 (`sources/teryt/<day>/`). Nothing is applied automatically: waste zones map streets by name. Full files rather than TERYT's update files: a diff by id needs no record of the last check. TERYT ws1 (SOAP, needs an account) is the alternative if the form ever stops working; that is Jakub's call.
- 2026-10-23: today's files match those of 2026-10-16 for both gminy (276 streets, 69 localities).

## 8. Change monitoring (summary)
| What | How | Frequency |
|---|---|---|
| City JPGs | WP media API `?search=harmonogram&after=…` + HEAD/ETag/sha256 of the known files + hash of the page HTML | daily |
| Gmina PDFs + "częstotliwość" posts | WP posts API `?search=odpad` new items + sha256 of the PDFs | daily |
| Water | gmina WP API + MZGKiM RSS | every 2 h (06–22) |
| IMGW | API | every 30 min |
| TERYT | file download | monthly |
Any change ⇒ the ETL **does not publish** new dates automatically. It opens a GitHub issue / PR "review needed" (details in task-10/12).
