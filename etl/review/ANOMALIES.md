# Anomalies to confirm

Provisional extract. Nothing here is approved (`reviewedBy` is null).
Each item cites the source file and sha256. No fix is suggested.

## Coverage

- Events (one per fraction per date): 1012
- City streets in a zone: 186
- City TERYT objects in no zone: 20
- Parent settlements in a zone: 24 (localities kind wies: 24)
- Village parts in the locality list: 39
- Zones: 10

Pickup dates (cells, before splitting fractions):

- `miasto-s1`: 64 (zmieszane+popiol 26, papier+tworzywa_metale+szklo 15, bio 21, wielkogabarytowe+elektro+opony+tekstylia 2)
- `miasto-s2`: 64 (zmieszane+popiol 26, papier+tworzywa_metale+szklo 15, bio 21, wielkogabarytowe+elektro+opony+tekstylia 2)
- `miasto-s3`: 64 (zmieszane+popiol 26, papier+tworzywa_metale+szklo 15, bio 21, wielkogabarytowe+elektro+opony+tekstylia 2)
- `miasto-s4`: 65 (zmieszane+popiol 27, papier+tworzywa_metale+szklo 15, bio 21, wielkogabarytowe+elektro+opony+tekstylia 2)
- `miasto-s5`: 64 (zmieszane+popiol 26, papier+tworzywa_metale+szklo 15, bio 21, wielkogabarytowe+elektro+opony+tekstylia 2)
- `gmina-s1`: 33 (zmieszane+bio 19, selektywne 12, wielkogabarytowe 2)
- `gmina-s2`: 33 (zmieszane+bio 19, selektywne 12, wielkogabarytowe 2)
- `gmina-s3`: 33 (zmieszane+bio 19, selektywne 12, wielkogabarytowe 2)
- `gmina-s4`: 33 (zmieszane+bio 19, selektywne 12, wielkogabarytowe 2)
- `gmina-s5`: 33 (zmieszane+bio 19, selektywne 12, wielkogabarytowe 2)

## S2 and S3 date tables

- The Pass A date tables for miasto S2 and S3 are identical, and `S2_S3_identical_in_source` is set. Street lists differ. `docs/data/miasto/harmonogram-2026-s2.jpg` sha256 `fb408b9ca0c3e3e109fcf2b692cef5b6c09e3a2d79745ee21fcd2094ef1e2761` date table and `docs/data/miasto/harmonogram-2026-s3.jpg` sha256 `af55af4e1b8f16e093d9ce13dcace64b201be708857fa00837a0a1a43f1d5bce` date table.
- Needs Jakub's confirmation. This extract does not change either table.

## Pass A vs Pass B

- No date-cell or street-list mismatches.

## City streets in no sector

TERYT city objects that are not members of any waste zone. No sector was guessed. Schedule spellings with no TERYT hit are listed below and are not linked to these rows.

- ul. Ppłk Franciszka Herzoga (SYM_UL 38687). `docs/data/teryt/ULIC_1809011_miasto_lubaczow.csv` sha256 `58fa1651aa1b697a79fa7c14f0383f8b9cb911bb2f7045b7f6fdf0e4dcd077a2` ULIC row.
- ul. Dr Henryka M. Szymańskiego (SYM_UL 48943). `docs/data/teryt/ULIC_1809011_miasto_lubaczow.csv` sha256 `58fa1651aa1b697a79fa7c14f0383f8b9cb911bb2f7045b7f6fdf0e4dcd077a2` ULIC row.
- al. aleja kardynała Mariana Jaworskiego (SYM_UL 57638). `docs/data/teryt/ULIC_1809011_miasto_lubaczow.csv` sha256 `58fa1651aa1b697a79fa7c14f0383f8b9cb911bb2f7045b7f6fdf0e4dcd077a2` ULIC row.
- ul. gen. Hallera (SYM_UL 06480). `docs/data/teryt/ULIC_1809011_miasto_lubaczow.csv` sha256 `58fa1651aa1b697a79fa7c14f0383f8b9cb911bb2f7045b7f6fdf0e4dcd077a2` ULIC row.
- ul. Aleksandra Gierymskiego (SYM_UL 05510). `docs/data/teryt/ULIC_1809011_miasto_lubaczow.csv` sha256 `58fa1651aa1b697a79fa7c14f0383f8b9cb911bb2f7045b7f6fdf0e4dcd077a2` ULIC row.
- ul. Ustronna (SYM_UL 23434). `docs/data/teryt/ULIC_1809011_miasto_lubaczow.csv` sha256 `58fa1651aa1b697a79fa7c14f0383f8b9cb911bb2f7045b7f6fdf0e4dcd077a2` ULIC row.
- ul. Działkowa (SYM_UL 04572). `docs/data/teryt/ULIC_1809011_miasto_lubaczow.csv` sha256 `58fa1651aa1b697a79fa7c14f0383f8b9cb911bb2f7045b7f6fdf0e4dcd077a2` ULIC row.
- ul. Wojciecha Kossaka (SYM_UL 09464). `docs/data/teryt/ULIC_1809011_miasto_lubaczow.csv` sha256 `58fa1651aa1b697a79fa7c14f0383f8b9cb911bb2f7045b7f6fdf0e4dcd077a2` ULIC row.
- ul. Łąkowa (SYM_UL 11596). `docs/data/teryt/ULIC_1809011_miasto_lubaczow.csv` sha256 `58fa1651aa1b697a79fa7c14f0383f8b9cb911bb2f7045b7f6fdf0e4dcd077a2` ULIC row.
- ul. Józefa Chełmońskiego (SYM_UL 02706). `docs/data/teryt/ULIC_1809011_miasto_lubaczow.csv` sha256 `58fa1651aa1b697a79fa7c14f0383f8b9cb911bb2f7045b7f6fdf0e4dcd077a2` ULIC row.
- ul. Artura Grottgera (SYM_UL 06206). `docs/data/teryt/ULIC_1809011_miasto_lubaczow.csv` sha256 `58fa1651aa1b697a79fa7c14f0383f8b9cb911bb2f7045b7f6fdf0e4dcd077a2` ULIC row.
- ul. Podleśna (SYM_UL 16799). `docs/data/teryt/ULIC_1809011_miasto_lubaczow.csv` sha256 `58fa1651aa1b697a79fa7c14f0383f8b9cb911bb2f7045b7f6fdf0e4dcd077a2` ULIC row.
- os. Osiedle Mickiewicza (SYM_UL 48372). `docs/data/teryt/ULIC_1809011_miasto_lubaczow.csv` sha256 `58fa1651aa1b697a79fa7c14f0383f8b9cb911bb2f7045b7f6fdf0e4dcd077a2` ULIC row.
- ul. Mjr. Hubala (SYM_UL 48371). `docs/data/teryt/ULIC_1809011_miasto_lubaczow.csv` sha256 `58fa1651aa1b697a79fa7c14f0383f8b9cb911bb2f7045b7f6fdf0e4dcd077a2` ULIC row.
- os. Osiedle Unii Lubelskiej (SYM_UL 48373). `docs/data/teryt/ULIC_1809011_miasto_lubaczow.csv` sha256 `58fa1651aa1b697a79fa7c14f0383f8b9cb911bb2f7045b7f6fdf0e4dcd077a2` ULIC row.
- ul. 3-go Maja (SYM_UL 29830). `docs/data/teryt/ULIC_1809011_miasto_lubaczow.csv` sha256 `58fa1651aa1b697a79fa7c14f0383f8b9cb911bb2f7045b7f6fdf0e4dcd077a2` ULIC row.
- ul. Arcybiskupa Eugeniusza Baziaka (SYM_UL 48369). `docs/data/teryt/ULIC_1809011_miasto_lubaczow.csv` sha256 `58fa1651aa1b697a79fa7c14f0383f8b9cb911bb2f7045b7f6fdf0e4dcd077a2` ULIC row.

## Roundabouts and the square

Listed separately. They are not missing residential streets.

- rondo Rondo im. Kazimierza Górskiego (SYM_UL 49322). `docs/data/teryt/ULIC_1809011_miasto_lubaczow.csv` sha256 `58fa1651aa1b697a79fa7c14f0383f8b9cb911bb2f7045b7f6fdf0e4dcd077a2` ULIC row.
- rondo Rondo im. Zesłańców Sybiru (SYM_UL 40641). `docs/data/teryt/ULIC_1809011_miasto_lubaczow.csv` sha256 `58fa1651aa1b697a79fa7c14f0383f8b9cb911bb2f7045b7f6fdf0e4dcd077a2` ULIC row.
- skwer Św. Apostołów Piotra i Pawła (SYM_UL 48378). `docs/data/teryt/ULIC_1809011_miasto_lubaczow.csv` sha256 `58fa1651aa1b697a79fa7c14f0383f8b9cb911bb2f7045b7f6fdf0e4dcd077a2` ULIC row.

## Schedule names with no single TERYT match

- `Mjr. Henryka Hubala` in `miasto-s1` matched 0 TERYT rows after normalisation and aliases. Not assigned. `docs/data/miasto/harmonogram-2026-s1.jpg` sha256 `cd2dabc9053dc72111495a8ac4bcf1af36f0a7366af452b40806368fafaad624` street list.
- `Abp. Eugeniusza Baziaka` in `miasto-s3` matched 0 TERYT rows after normalisation and aliases. Not assigned. `docs/data/miasto/harmonogram-2026-s3.jpg` sha256 `af55af4e1b8f16e093d9ce13dcace64b201be708857fa00837a0a1a43f1d5bce` street list.
- `3-ego Maja` in `miasto-s4` matched 0 TERYT rows after normalisation and aliases. Not assigned. `docs/data/miasto/harmonogram-2026-s4.jpg` sha256 `91171038fbab823badd430d0249f0ed20596ccb973c26b5e817ea57901aba1dc` street list.
- `Płk. Franciszka Herzoga` in `miasto-s4` matched 0 TERYT rows after normalisation and aliases. Not assigned. `docs/data/miasto/harmonogram-2026-s4.jpg` sha256 `91171038fbab823badd430d0249f0ed20596ccb973c26b5e817ea57901aba1dc` street list.
- `Dr. Henryka Szymańskiego` in `miasto-s5` matched 0 TERYT rows after normalisation and aliases. Not assigned. `docs/data/miasto/harmonogram-2026-s5.jpg` sha256 `c17185d966dac2a7edb300487768f78ec3488134650e7f93a6820e54928c5705` street list.
- `Gen. Józefa Hallera` in `miasto-s5` matched 0 TERYT rows after normalisation and aliases. Not assigned. `docs/data/miasto/harmonogram-2026-s5.jpg` sha256 `c17185d966dac2a7edb300487768f78ec3488134650e7f93a6820e54928c5705` street list.

## TERYT streets in two sectors

- None. No TERYT street was left in two zones.

## Weekday anomalies

A date whose weekday is not the sector's modal weekday. Holidays checked: 01.01, 06.01, 06.04, 01.05, 04.06, 15.08, 01.11, 11.11, 24–26.12.2026.

- gmina-s1 2026-04-02 (czw, usual pon) zmieszane/bio. not a listed holiday. `docs/data/gmina/1_2026_Lisie_Jamy_Dabrowa_Szczutkow.pdf` sha256 `139159406cbc20a5227225a428d65ee94962f55383ea0f3e235ef2d2ca760fcc` date cell.
- gmina-s1 2026-08-14 (pt, usual pon) zmieszane/bio. not a listed holiday. `docs/data/gmina/1_2026_Lisie_Jamy_Dabrowa_Szczutkow.pdf` sha256 `139159406cbc20a5227225a428d65ee94962f55383ea0f3e235ef2d2ca760fcc` date cell.
- gmina-s1 2026-09-01 (wt, usual pon) zmieszane/bio. not a listed holiday. `docs/data/gmina/1_2026_Lisie_Jamy_Dabrowa_Szczutkow.pdf` sha256 `139159406cbc20a5227225a428d65ee94962f55383ea0f3e235ef2d2ca760fcc` date cell.
- gmina-s1 2026-08-14 (pt, usual pon) tworzywa_metale/papier/szklo. not a listed holiday. `docs/data/gmina/1_2026_Lisie_Jamy_Dabrowa_Szczutkow.pdf` sha256 `139159406cbc20a5227225a428d65ee94962f55383ea0f3e235ef2d2ca760fcc` date cell.
- gmina-s1 2026-03-24 (wt, usual pon) wielkogabarytowe. not a listed holiday. `docs/data/gmina/1_2026_Lisie_Jamy_Dabrowa_Szczutkow.pdf` sha256 `139159406cbc20a5227225a428d65ee94962f55383ea0f3e235ef2d2ca760fcc` date cell.
- gmina-s1 2026-09-22 (wt, usual pon) wielkogabarytowe. not a listed holiday. `docs/data/gmina/1_2026_Lisie_Jamy_Dabrowa_Szczutkow.pdf` sha256 `139159406cbc20a5227225a428d65ee94962f55383ea0f3e235ef2d2ca760fcc` date cell.
- gmina-s2 2026-09-02 (śr, usual wt) zmieszane/bio. not a listed holiday. `docs/data/gmina/2_2026_WolkaKrowicka_Budomierz_Krowica.pdf.pdf` sha256 `9ede01e712ca718ae57cfb737bca9672fb4afde13c2ee231eacd901364417ee2` date cell.
- gmina-s2 2026-03-25 (śr, usual wt) wielkogabarytowe. not a listed holiday. `docs/data/gmina/2_2026_WolkaKrowicka_Budomierz_Krowica.pdf.pdf` sha256 `9ede01e712ca718ae57cfb737bca9672fb4afde13c2ee231eacd901364417ee2` date cell.
- gmina-s2 2026-09-23 (śr, usual wt) wielkogabarytowe. not a listed holiday. `docs/data/gmina/2_2026_WolkaKrowicka_Budomierz_Krowica.pdf.pdf` sha256 `9ede01e712ca718ae57cfb737bca9672fb4afde13c2ee231eacd901364417ee2` date cell.
- gmina-s3 2026-09-03 (czw, usual śr) zmieszane/bio. not a listed holiday. `docs/data/gmina/3_2026_BorowaGora_Karolowka_Hurcze_Opaka.pdf` sha256 `2472148475fe77cfce5261197cb5f126beaaff8eeabe71665961ee1f53a10054` date cell.
- gmina-s3 2026-03-26 (czw, usual śr) wielkogabarytowe. not a listed holiday. `docs/data/gmina/3_2026_BorowaGora_Karolowka_Hurcze_Opaka.pdf` sha256 `2472148475fe77cfce5261197cb5f126beaaff8eeabe71665961ee1f53a10054` date cell.
- gmina-s3 2026-09-24 (czw, usual śr) wielkogabarytowe. not a listed holiday. `docs/data/gmina/3_2026_BorowaGora_Karolowka_Hurcze_Opaka.pdf` sha256 `2472148475fe77cfce5261197cb5f126beaaff8eeabe71665961ee1f53a10054` date cell.
- gmina-s4 2026-06-08 (pon, usual czw) zmieszane/bio. not a listed holiday. `docs/data/gmina/4_2026_Basznie_Tymce_Podlesie_Huta_Krysz.pdf` sha256 `efbad93c131426210ec7b2c68c1ebc406664d40168a9d9c24c83d3f4dcde863a` date cell.
- gmina-s4 2026-09-04 (pt, usual czw) zmieszane/bio. not a listed holiday. `docs/data/gmina/4_2026_Basznie_Tymce_Podlesie_Huta_Krysz.pdf` sha256 `efbad93c131426210ec7b2c68c1ebc406664d40168a9d9c24c83d3f4dcde863a` date cell.
- gmina-s4 2026-03-27 (pt, usual czw) wielkogabarytowe. not a listed holiday. `docs/data/gmina/4_2026_Basznie_Tymce_Podlesie_Huta_Krysz.pdf` sha256 `efbad93c131426210ec7b2c68c1ebc406664d40168a9d9c24c83d3f4dcde863a` date cell.
- gmina-s4 2026-09-25 (pt, usual czw) wielkogabarytowe. not a listed holiday. `docs/data/gmina/4_2026_Basznie_Tymce_Podlesie_Huta_Krysz.pdf` sha256 `efbad93c131426210ec7b2c68c1ebc406664d40168a9d9c24c83d3f4dcde863a` date cell.
- gmina-s5 2026-06-09 (wt, usual pt) zmieszane/bio. not a listed holiday. `docs/data/gmina/5_2026_Mokrzyca_Zaluze_Piastowo_Antoniki_Balaje_Dabkow.pdf` sha256 `755893808bae353e2e5ea0ca371b8f81b2f2cb8d6187c9f4d1f58738aa2e9e8d` date cell.
- gmina-s5 2026-09-07 (pon, usual pt) zmieszane/bio. not a listed holiday. `docs/data/gmina/5_2026_Mokrzyca_Zaluze_Piastowo_Antoniki_Balaje_Dabkow.pdf` sha256 `755893808bae353e2e5ea0ca371b8f81b2f2cb8d6187c9f4d1f58738aa2e9e8d` date cell.
- gmina-s5 2026-03-31 (wt, usual pt) wielkogabarytowe. not a listed holiday. `docs/data/gmina/5_2026_Mokrzyca_Zaluze_Piastowo_Antoniki_Balaje_Dabkow.pdf` sha256 `755893808bae353e2e5ea0ca371b8f81b2f2cb8d6187c9f4d1f58738aa2e9e8d` date cell.
- gmina-s5 2026-09-29 (wt, usual pt) wielkogabarytowe. not a listed holiday. `docs/data/gmina/5_2026_Mokrzyca_Zaluze_Piastowo_Antoniki_Balaje_Dabkow.pdf` sha256 `755893808bae353e2e5ea0ca371b8f81b2f2cb8d6187c9f4d1f58738aa2e9e8d` date cell.
- miasto-s1 2026-04-08 (śr, usual pon) zmieszane/popiol. not a listed holiday. `docs/data/miasto/harmonogram-2026-s1.jpg` sha256 `cd2dabc9053dc72111495a8ac4bcf1af36f0a7366af452b40806368fafaad624` date cell.
- miasto-s1 2026-04-01 (śr, usual pon) papier/tworzywa_metale/szklo. not a listed holiday. `docs/data/miasto/harmonogram-2026-s1.jpg` sha256 `cd2dabc9053dc72111495a8ac4bcf1af36f0a7366af452b40806368fafaad624` date cell.
- miasto-s1 2026-09-01 (wt, usual pon) papier/tworzywa_metale/szklo. not a listed holiday. `docs/data/miasto/harmonogram-2026-s1.jpg` sha256 `cd2dabc9053dc72111495a8ac4bcf1af36f0a7366af452b40806368fafaad624` date cell.
- miasto-s1 2026-04-01 (śr, usual pon) bio. not a listed holiday. `docs/data/miasto/harmonogram-2026-s1.jpg` sha256 `cd2dabc9053dc72111495a8ac4bcf1af36f0a7366af452b40806368fafaad624` date cell.
- miasto-s1 2026-09-02 (śr, usual pon) bio. not a listed holiday. `docs/data/miasto/harmonogram-2026-s1.jpg` sha256 `cd2dabc9053dc72111495a8ac4bcf1af36f0a7366af452b40806368fafaad624` date cell.
- miasto-s1 2026-03-05 (czw, usual pon) wielkogabarytowe/elektro/opony/tekstylia. not a listed holiday. `docs/data/miasto/harmonogram-2026-s1.jpg` sha256 `cd2dabc9053dc72111495a8ac4bcf1af36f0a7366af452b40806368fafaad624` date cell.
- miasto-s1 2026-09-03 (czw, usual pon) wielkogabarytowe/elektro/opony/tekstylia. not a listed holiday. `docs/data/miasto/harmonogram-2026-s1.jpg` sha256 `cd2dabc9053dc72111495a8ac4bcf1af36f0a7366af452b40806368fafaad624` date cell.
- miasto-s2 2026-01-07 (śr, usual wt) bio. not a listed holiday. `docs/data/miasto/harmonogram-2026-s2.jpg` sha256 `fb408b9ca0c3e3e109fcf2b692cef5b6c09e3a2d79745ee21fcd2094ef1e2761` date cell.
- miasto-s2 2026-04-02 (czw, usual wt) bio. not a listed holiday. `docs/data/miasto/harmonogram-2026-s2.jpg` sha256 `fb408b9ca0c3e3e109fcf2b692cef5b6c09e3a2d79745ee21fcd2094ef1e2761` date cell.
- miasto-s2 2026-03-16 (pon, usual wt) wielkogabarytowe/elektro/opony/tekstylia. not a listed holiday. `docs/data/miasto/harmonogram-2026-s2.jpg` sha256 `fb408b9ca0c3e3e109fcf2b692cef5b6c09e3a2d79745ee21fcd2094ef1e2761` date cell.
- miasto-s2 2026-09-16 (śr, usual wt) wielkogabarytowe/elektro/opony/tekstylia. not a listed holiday. `docs/data/miasto/harmonogram-2026-s2.jpg` sha256 `fb408b9ca0c3e3e109fcf2b692cef5b6c09e3a2d79745ee21fcd2094ef1e2761` date cell.
- miasto-s3 2026-01-07 (śr, usual wt) bio. not a listed holiday. `docs/data/miasto/harmonogram-2026-s3.jpg` sha256 `af55af4e1b8f16e093d9ce13dcace64b201be708857fa00837a0a1a43f1d5bce` date cell.
- miasto-s3 2026-04-02 (czw, usual wt) bio. not a listed holiday. `docs/data/miasto/harmonogram-2026-s3.jpg` sha256 `af55af4e1b8f16e093d9ce13dcace64b201be708857fa00837a0a1a43f1d5bce` date cell.
- miasto-s3 2026-03-16 (pon, usual wt) wielkogabarytowe/elektro/opony/tekstylia. not a listed holiday. `docs/data/miasto/harmonogram-2026-s3.jpg` sha256 `af55af4e1b8f16e093d9ce13dcace64b201be708857fa00837a0a1a43f1d5bce` date cell.
- miasto-s3 2026-09-16 (śr, usual wt) wielkogabarytowe/elektro/opony/tekstylia. not a listed holiday. `docs/data/miasto/harmonogram-2026-s3.jpg` sha256 `af55af4e1b8f16e093d9ce13dcace64b201be708857fa00837a0a1a43f1d5bce` date cell.
- miasto-s4 2026-01-02 (pt, usual czw) zmieszane/popiol. not a listed holiday. `docs/data/miasto/harmonogram-2026-s4.jpg` sha256 `91171038fbab823badd430d0249f0ed20596ccb973c26b5e817ea57901aba1dc` date cell.
- miasto-s4 2026-06-03 (śr, usual czw) zmieszane/popiol. not a listed holiday. `docs/data/miasto/harmonogram-2026-s4.jpg` sha256 `91171038fbab823badd430d0249f0ed20596ccb973c26b5e817ea57901aba1dc` date cell.
- miasto-s4 2026-12-23 (śr, usual czw) papier/tworzywa_metale/szklo. not a listed holiday. `docs/data/miasto/harmonogram-2026-s4.jpg` sha256 `91171038fbab823badd430d0249f0ed20596ccb973c26b5e817ea57901aba1dc` date cell.
- miasto-s4 2026-03-20 (pt, usual czw) wielkogabarytowe/elektro/opony/tekstylia. not a listed holiday. `docs/data/miasto/harmonogram-2026-s4.jpg` sha256 `91171038fbab823badd430d0249f0ed20596ccb973c26b5e817ea57901aba1dc` date cell.
- miasto-s4 2026-09-21 (pon, usual czw) wielkogabarytowe/elektro/opony/tekstylia. not a listed holiday. `docs/data/miasto/harmonogram-2026-s4.jpg` sha256 `91171038fbab823badd430d0249f0ed20596ccb973c26b5e817ea57901aba1dc` date cell.
- miasto-s5 2026-12-30 (śr, usual pt) papier/tworzywa_metale/szklo. not a listed holiday. `docs/data/miasto/harmonogram-2026-s5.jpg` sha256 `c17185d966dac2a7edb300487768f78ec3488134650e7f93a6820e54928c5705` date cell.
- miasto-s5 2026-04-29 (śr, usual pt) bio. not a listed holiday. `docs/data/miasto/harmonogram-2026-s5.jpg` sha256 `c17185d966dac2a7edb300487768f78ec3488134650e7f93a6820e54928c5705` date cell.
- miasto-s5 2026-03-30 (pon, usual pt) wielkogabarytowe/elektro/opony/tekstylia. not a listed holiday. `docs/data/miasto/harmonogram-2026-s5.jpg` sha256 `c17185d966dac2a7edb300487768f78ec3488134650e7f93a6820e54928c5705` date cell.
- miasto-s5 2026-09-30 (śr, usual pt) wielkogabarytowe/elektro/opony/tekstylia. not a listed holiday. `docs/data/miasto/harmonogram-2026-s5.jpg` sha256 `c17185d966dac2a7edb300487768f78ec3488134650e7f93a6820e54928c5705` date cell.

- The list matches `docs/data/sample/weekday-anomalies.txt` (44 lines).

## Duplicate dates and dates outside 2026

- No duplicate date inside a cell, and no duplicate zone/fraction/date event.
- No date outside 2026 and no impossible calendar day.

## Gmina column 1

- The PDF header is `ODPADY KOMUNALNE ZMIESZANE I BIO` with one day list. This extract emits both `zmieszane` and `bio` on every date in that column, which is what the header says, and it is not confirmed. `docs/data/gmina/1_2026_Lisie_Jamy_Dabrowa_Szczutkow.pdf` sha256 `139159406cbc20a5227225a428d65ee94962f55383ea0f3e235ef2d2ca760fcc` column 1 header.

## Villages read from the PDFs

- `gmina-s1`: Lisie Jamy, Dąbrowa, Szczutków. `docs/data/gmina/1_2026_Lisie_Jamy_Dabrowa_Szczutkow.pdf` sha256 `139159406cbc20a5227225a428d65ee94962f55383ea0f3e235ef2d2ca760fcc` left column.
- `gmina-s2`: Wólka Krowicka, Budomierz, Krowica Hołodowska, Krowica Sama, Krowica Lasowa. `docs/data/gmina/2_2026_WolkaKrowicka_Budomierz_Krowica.pdf.pdf` sha256 `9ede01e712ca718ae57cfb737bca9672fb4afde13c2ee231eacd901364417ee2` left column.
- `gmina-s3`: Borowa Góra, Karolówka, Młodów, Hurcze, Opaka. `docs/data/gmina/3_2026_BorowaGora_Karolowka_Hurcze_Opaka.pdf` sha256 `2472148475fe77cfce5261197cb5f126beaaff8eeabe71665961ee1f53a10054` left column.
- `gmina-s4`: Basznia Dolna, Tymce, Basznia Górna, Podlesie, Huta Kryształowa. `docs/data/gmina/4_2026_Basznie_Tymce_Podlesie_Huta_Krysz.pdf` sha256 `efbad93c131426210ec7b2c68c1ebc406664d40168a9d9c24c83d3f4dcde863a` left column.
- `gmina-s5`: Mokrzyca, Załuże, Piastowo, Antoniki, Bałaje, Dąbków. `docs/data/gmina/5_2026_Mokrzyca_Zaluze_Piastowo_Antoniki_Balaje_Dabkow.pdf` sha256 `755893808bae353e2e5ea0ca371b8f81b2f2cb8d6187c9f4d1f58738aa2e9e8d` left column.

Młodów is in the S3 PDF. It is not in the S3 file name.
