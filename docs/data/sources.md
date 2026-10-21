# Data sources

<!-- Generated from etl/sources.yaml by `npm run config:sync`; do not edit. -->

Raw source files are not in git. They are archived in a private S3 bucket and pulled into a gitignored local cache when the ETL needs them. The sources, their public pages and this list live in `etl/sources.yaml`; this page is generated from it.

- Bucket: `conaulicy-sources-aaed02` (eu-central-1): Block Public Access on, versioning on, SSE-S3 encryption, no bucket policy, no ACL grants. Jakub's AWS credentials, and the import's GitHub Actions role (PutObject/GetObject on `sources/*` only).
- Key layout: `sources/<origin>/<fetch date>/<file>`.
- Pull: `cd web && npm run sources:pull` downloads every file below into `.cache/sources/` (repo root, gitignored) and checks its SHA-256. Nothing in the build, CI or the running site needs these files.
- Files the unattended import archives later (docs/import.md) are listed in the database table `source_files`, not here.
- Adding a file by hand: upload it under the same layout, add it to `archived` in `etl/sources.yaml`, run `npm run config:sync` and `npm run sources:pull`.

`meta` holds our own files about the sources (the inventory snapshot, checksums, the prototype transcription and its samples); the sources themselves are the public documents linked in the table. Public links are always the original pages, never the archive.

| File | Origin | Public source | Fetched | S3 key | SHA-256 |
|---|---|---|---|---|---|
| 1_2026_Lisie_Jamy_Dabrowa_Szczutkow.pdf | gmina | <https://www.gminalubaczow.pl/wp-content/uploads/2026/01/1_2026_Lisie_Jamy_Dabrowa_Szczutkow.pdf> | 2026-10-18 | `sources/gmina/2026-10-18/1_2026_Lisie_Jamy_Dabrowa_Szczutkow.pdf` | `139159406cbc20a5227225a428d65ee94962f55383ea0f3e235ef2d2ca760fcc` |
| 2_2026_WolkaKrowicka_Budomierz_Krowica.pdf.pdf | gmina | <https://www.gminalubaczow.pl/wp-content/uploads/2026/01/2_2026_WolkaKrowicka_Budomierz_Krowica.pdf.pdf> | 2026-10-18 | `sources/gmina/2026-10-18/2_2026_WolkaKrowicka_Budomierz_Krowica.pdf.pdf` | `9ede01e712ca718ae57cfb737bca9672fb4afde13c2ee231eacd901364417ee2` |
| 3_2026_BorowaGora_Karolowka_Hurcze_Opaka.pdf | gmina | <https://www.gminalubaczow.pl/wp-content/uploads/2026/01/3_2026_BorowaGora_Karolowka_Hurcze_Opaka.pdf> | 2026-10-18 | `sources/gmina/2026-10-18/3_2026_BorowaGora_Karolowka_Hurcze_Opaka.pdf` | `2472148475fe77cfce5261197cb5f126beaaff8eeabe71665961ee1f53a10054` |
| 4_2026_Basznie_Tymce_Podlesie_Huta_Krysz.pdf | gmina | <https://www.gminalubaczow.pl/wp-content/uploads/2026/01/4_2026_Basznie_Tymce_Podlesie_Huta_Krysz.pdf> | 2026-10-18 | `sources/gmina/2026-10-18/4_2026_Basznie_Tymce_Podlesie_Huta_Krysz.pdf` | `efbad93c131426210ec7b2c68c1ebc406664d40168a9d9c24c83d3f4dcde863a` |
| 5_2026_Mokrzyca_Zaluze_Piastowo_Antoniki_Balaje_Dabkow.pdf | gmina | <https://www.gminalubaczow.pl/wp-content/uploads/2026/01/5_2026_Mokrzyca_Zaluze_Piastowo_Antoniki_Balaje_Dabkow.pdf> | 2026-10-18 | `sources/gmina/2026-10-18/5_2026_Mokrzyca_Zaluze_Piastowo_Antoniki_Balaje_Dabkow.pdf` | `755893808bae353e2e5ea0ca371b8f81b2f2cb8d6187c9f4d1f58738aa2e9e8d` |
| gmina_harm2026.html | gmina | <https://www.gminalubaczow.pl/2026/01/02/harmonogram-odbioru-odpadow-komunalnych-na-rok-2026/> | 2026-10-18 | `sources/gmina/2026-10-18/gmina_harm2026.html` | `ea6df0aca9e32733812b4d4261408cb580dce120f54f8397e51fe44983e88d11` |
| gmina_woda_wp-api_sample.json | gmina | <https://www.gminalubaczow.pl/wp-json/wp/v2/posts?search=przerwa%20w%20dostawie%20wody&_fields=date,link,title,content> | 2026-10-18 | `sources/gmina/2026-10-18/gmina_woda_wp-api_sample.json` | `ec17aea15a49a631fba2c2af5c63b40d2de29737cff353a99bb7f8637c59b63a` |
| czystylubaczow_harmonogram.html | miasto | <https://czystylubaczow.info/odbior-odpadow/harmonogram-odbioru-odpadow/> | 2026-10-18 | `sources/miasto/2026-10-18/czystylubaczow_harmonogram.html` | `79dbfd2455d18cb5cd6732ef616c6298ac7aec6d8fce46caec15dcdee83ced11` |
| harmonogram-2026-s1.jpg | miasto | <https://czystylubaczow.info/wp-content/uploads/2025/12/harmonogram-2026-s1.jpg> | 2026-10-18 | `sources/miasto/2026-10-18/harmonogram-2026-s1.jpg` | `cd2dabc9053dc72111495a8ac4bcf1af36f0a7366af452b40806368fafaad624` |
| harmonogram-2026-s2.jpg | miasto | <https://czystylubaczow.info/wp-content/uploads/2025/12/harmonogram-2026-s2.jpg> | 2026-10-18 | `sources/miasto/2026-10-18/harmonogram-2026-s2.jpg` | `fb408b9ca0c3e3e109fcf2b692cef5b6c09e3a2d79745ee21fcd2094ef1e2761` |
| harmonogram-2026-s3.jpg | miasto | <https://czystylubaczow.info/wp-content/uploads/2025/12/harmonogram-2026-s3.jpg> | 2026-10-18 | `sources/miasto/2026-10-18/harmonogram-2026-s3.jpg` | `af55af4e1b8f16e093d9ce13dcace64b201be708857fa00837a0a1a43f1d5bce` |
| harmonogram-2026-s4.jpg | miasto | <https://czystylubaczow.info/wp-content/uploads/2025/12/harmonogram-2026-s4.jpg> | 2026-10-18 | `sources/miasto/2026-10-18/harmonogram-2026-s4.jpg` | `91171038fbab823badd430d0249f0ed20596ccb973c26b5e817ea57901aba1dc` |
| harmonogram-2026-s5.jpg | miasto | <https://czystylubaczow.info/wp-content/uploads/2025/12/harmonogram-2026-s5.jpg> | 2026-10-18 | `sources/miasto/2026-10-18/harmonogram-2026-s5.jpg` | `c17185d966dac2a7edb300487768f78ec3488134650e7f93a6820e54928c5705` |
| mzgkim_feed_2026-10-18.xml | mzgkim | <https://mzgkim.lubaczow.pl/feed/> | 2026-10-18 | `sources/mzgkim/2026-10-18/mzgkim_feed_2026-10-18.xml` | `69e42a66943dad4f6b573e0e7ed0ca042b98ee3c30f0061e7f9b45d032691e9d` |
| imgw_warningshydro_2026-10-18.json | imgw | <https://danepubliczne.imgw.pl/api/data/warningshydro> | 2026-10-18 | `sources/imgw/2026-10-18/imgw_warningshydro_2026-10-18.json` | `58f5645350c13d116caebf0ca51d81b49ef37e0b648f775e8fde120911d630d6` |
| imgw_warningsmeteo_2026-10-18.json | imgw | <https://danepubliczne.imgw.pl/api/data/warningsmeteo> | 2026-10-18 | `sources/imgw/2026-10-18/imgw_warningsmeteo_2026-10-18.json` | `571a53e5e9a7a43042d47000b531fed3f9d580d3ece5183a038fd7af8088de8b` |
| rso_podkarpackie_2026-10-18.json | rso | <https://komunikaty.tvp.pl/komunikatyxml/podkarpackie/wszystkie/0?_format=json> | 2026-10-18 | `sources/rso/2026-10-18/rso_podkarpackie_2026-10-18.json` | `5f4260599deebc4755edf27b49865da8436f2e558875f5492f1d05be2905cde1` |
| SIMC_1809011_1809042.csv | teryt | <https://eteryt.stat.gov.pl/eTeryt/rejestr_teryt/udostepnianie_danych/baza_teryt/uzytkownicy_indywidualni/pobieranie/pliki_pelne.aspx> | 2026-10-18 | `sources/teryt/2026-10-18/SIMC_1809011_1809042.csv` | `4c67881735127667b2cd926c4c50a4886e274448d8f01c487500826726b1aeec` |
| ULIC_1809011_miasto_lubaczow.csv | teryt | <https://eteryt.stat.gov.pl/eTeryt/rejestr_teryt/udostepnianie_danych/baza_teryt/uzytkownicy_indywidualni/pobieranie/pliki_pelne.aspx> | 2026-10-18 | `sources/teryt/2026-10-18/ULIC_1809011_miasto_lubaczow.csv` | `58fa1651aa1b697a79fa7c14f0383f8b9cb911bb2f7045b7f6fdf0e4dcd077a2` |
| ULIC_1809042_gmina_lubaczow.csv | teryt | <https://eteryt.stat.gov.pl/eTeryt/rejestr_teryt/udostepnianie_danych/baza_teryt/uzytkownicy_indywidualni/pobieranie/pliki_pelne.aspx> | 2026-10-18 | `sources/teryt/2026-10-18/ULIC_1809042_gmina_lubaczow.csv` | `8515ea542c8e0b698ece7d5c81eb0e2160545a34b039c160945946eeb68fee7e` |
| wigan-calendar.pdf | inspiration | <https://apps.wigan.gov.uk/MyNeighbourhood/Calendars/THUCCG.pdf?id=55066> | 2026-10-19 | `sources/inspiration/2026-10-19/wigan-calendar.pdf` | `bcd57afdef51dbc597cf03d765b78a7915980bcea097a12d5b742d1cf4066ad8` |
| DATA-INVENTORY.md | meta | — | 2026-10-18 | `sources/meta/2026-10-18/DATA-INVENTORY.md` | `1e56afa446d759b597c23c4eba47265a95e2e212d2d898a39ab8cad94743f0d7` |
| SHA256SUMS.txt | meta | — | 2026-10-18 | `sources/meta/2026-10-18/SHA256SUMS.txt` | `1a03dd61e02d8b566dc0978b251a131b3f7344bc34647f5b0f3bf0d0cc36f55c` |
| address-register.sample.json | meta | — | 2026-10-18 | `sources/meta/2026-10-18/address-register.sample.json` | `a3f490dcabb8aed958efdafe379fae3e2feb0872a0b88ec009c549e92f718e97` |
| build_sample.py | meta | — | 2026-10-18 | `sources/meta/2026-10-18/build_sample.py` | `ab6bed7bf68166b6c4a41c4d25c234e446d615d25934101d20495706ca7c77a5` |
| schedule-2026.sample.json | meta | — | 2026-10-18 | `sources/meta/2026-10-18/schedule-2026.sample.json` | `c0c659baceeedf3bdbefa636964a66840c63bd7e53c07d7234b31a61ed32e9a0` |
| weekday-anomalies.txt | meta | — | 2026-10-18 | `sources/meta/2026-10-18/weekday-anomalies.txt` | `58b6977c264dabc1d9c0533941a4e96e2ee59fa82e18aaab5b7dc442f8f1b9c0` |
