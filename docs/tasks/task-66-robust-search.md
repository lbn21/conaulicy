# Task 66: robust search – uFuzzy core + Polish layer, one shared module

Approved by Jakub, 23 Oct 2026. Branch: `feat/robust-search` from the latest `origin/main` (after task 65 / PR #87): `git fetch && git switch main && git pull --ff-only && git switch -c feat/robust-search`.

## Goal
Robust street/village search with **@leeoniya/ufuzzy** (MIT, 1.0.19, zero deps; pin the exact version) as the matching core plus our Polish layer, in **one shared module** (e.g. `web/lib/search.ts`) used identically by the autocomplete (client `source` function), `/api/search` and `/szukaj` (no JS). Same input → same ranked results everywhere.

## Polish layer
- Normalise: lowercase, strip diacritics incl. ł→l (`uFuzzy.latinize` or own map), punctuation, collapse spaces.
- Strip postcodes `\d\d-\d\d\d`.
- Extract the house number (`5`, `5a`, `5/2`), anywhere in the query, incl. after the label („ul. Rynek, Lubaczów 5”) and inside it („ul. Rynek 5, Lubaczów”). Keep the existing ?nr= handling and the L3 rule (page ignores nr on non-split streets). Careful: „3 Maja” – the 3 is part of the name, not a house number („3 maja 10” → 3-go Maja, nr 10; „Maja 3” → 3-go Maja).
- Synonyms: `ul.`/`ulica` dropped but kept as a hint (prefer streets over osiedla); `os.`=`osiedle`; `al.`=`aleja`; `3`=`3-go`=`trzeciego`; `św.`=`świętej`/`świętego`; `gen.`=`generała`; `chopin`=`szopen`.
- Inflection fallback (strip -u/-a/-i/-y/-e endings), and allow 2 edits for words of 7+ letters if uFuzzy's single-error mode misses (a fallback pass only).
- Custom sort: exact > word-prefix > infix (3+ chars) > inflection > typo; a village/main place above its parts (e.g. „Opaka (gm. Lubaczów)” above „Kamienna (Opaka, gm. Lubaczów)”); then label starts with the query; then shorter label. Max 8 suggestions.
- Single letter: prefix only, no fuzzy. Junk („xyzqq”, „qwer”, „zzzz”) → 0 results.

## /szukaj
308 only when there's one clearly strongest match (or an exact suggestion label, incl. the task-65 label + house-number forms – keep that resolution and its tests); otherwise the ranked list. Zero → existing „Brak wyników”.

## Constraints
- accessible-autocomplete stays the UI (its `source` function), task-65 behaviour unchanged (pick fills only, form submits). No custom keyboard/focus/scroll JS, no layout shift (CLS 0 in CI).
- Report client bundle growth (gzip) in the PR.
- CDN caching of `/api/search` and the immutable `/api/search-index/<hash>` unchanged.

## Tests (CI; unit tests run locally with `npm test`, no DB)
- A unit test fixture with the 330 labels below (an `[id, label]` JSON fixture file, ids synthetic if needed) and two batteries:
  - **tuning battery** (62 queries, from a prototype tuned on it) – copied verbatim below;
  - **held-out battery** (30 queries, written before any tuning) – below. Don't tune specifically to pass held-out cases by special-casing; general rules only.
  - Pass = the top result's label contains the expected string (normalised compare). Report pass rates for both sets in the PR. Target: tuning ≥ 95 %, held-out ≥ 85 %; list every failure.
  - Junk cases → 0 results; single letter → prefix only.
- Performance: < 5 ms/query average on the 330 places (unit test, with headroom for CI machines).
- No-JS parity (CI, against the CI fixture DB): for a set of queries, `/szukaj` top result (or redirect target) == `/api/search` top result == the shared module's top result.
- Keep the task-65 exact-label test for every place, and the e2e flows.

### Tuning battery (query → expected top label substring)
```js
export const battery = [
 ["rynek","ul. Rynek, Lubaczów"],["  RYNEK  ","ul. Rynek, Lubaczów"],["ul Rynek","ul. Rynek, Lubaczów"],["ulica rynek","ul. Rynek, Lubaczów"],
 ["Rynk","ul. Rynek, Lubaczów"],["Ryenk","ul. Rynek, Lubaczów"],["Rynku","ul. Rynek, Lubaczów"],["ynek","ul. Rynek, Lubaczów"],
 ["Lubaczów Rynek","ul. Rynek, Lubaczów"],["lubaczow rynek","ul. Rynek, Lubaczów"],["Rynek 5","ul. Rynek, Lubaczów"],["Rynek 5a","ul. Rynek, Lubaczów"],
 ["Rynek 5/2","ul. Rynek, Lubaczów"],["ul. Rynek 5, Lubaczów","ul. Rynek, Lubaczów"],["ul. Rynek, Lubaczów 5","ul. Rynek, Lubaczów"],["rynek 37-600","ul. Rynek, Lubaczów"],
 ["lakowa","ul. Łąkowa, Lubaczów"],["lakowa mlodow","ul. Łąkowa, Młodów"],["szkolna mlodow","ul. Szkolna, Młodów"],["zkoln","ul. Szkolna"],
 ["Asnyka","ul. Adama Asnyka, Lubaczów"],["Asnika","ul. Adama Asnyka, Lubaczów"],["snyk","ul. Adama Asnyka, Lubaczów"],["Adama Asnyka","ul. Adama Asnyka, Lubaczów"],
 ["Asnyka Adama","ul. Adama Asnyka, Lubaczów"],["Asnyka 12","ul. Adama Asnyka, Lubaczów"],["ul. Adama Asnyka 12, Lubaczów","ul. Adama Asnyka, Lubaczów"],
 ["Mickiewicza","Mickiewicza, Lubaczów"],["Mickiewicz","Mickiewicza, Lubaczów"],["Mickewicza","Mickiewicza, Lubaczów"],["ckiewi","Mickiewicza"],
 ["os. Mickiewicza","Osiedle Mickiewicza, Lubaczów"],["osiedle mickiewicza","Osiedle Mickiewicza, Lubaczów"],["ul. Mickiewicza","Mickiewicza, Lubaczów"],
 ["al. Jaworskiego","aleja kardynała Mariana Jaworskiego"],["Jaworskiego Lubaczów","aleja kardynała Mariana Jaworskiego, Lubaczów"],
 ["3 Maja","ul. 3-go Maja, Lubaczów"],["3-go Maja","ul. 3-go Maja, Lubaczów"],["Trzeciego Maja","ul. 3-go Maja, Lubaczów"],["Maja 3","ul. 3-go Maja, Lubaczów"],["3 maja 10","ul. 3-go Maja, Lubaczów"],
 ["Grunwald","ul. Grunwaldzka, Lubaczów"],["Grunwaldzka","ul. Grunwaldzka, Lubaczów"],["Grundwaldzka","ul. Grunwaldzka, Lubaczów"],
 ["Piłsudzkiego","ul. Józefa Piłsudskiego, Lubaczów"],["chopina","ul. Fryderyka Szopena, Lubaczów"],["Kosciuszki mlodow","ul. Tadeusza Kościuszki, Młodów"],
 ["zwirki i wigury","ul. Żwirki i Wigury, Lubaczów"],["sw anny","ul. Św. Anny, Lubaczów"],["swietej anny","ul. Św. Anny, Lubaczów"],["gen hallera","ul. gen. Hallera, Lubaczów"],
 ["Lubasy","Lubasy (Basznia Dolna, gm. Lubaczów)"],["Lubasy (Basznia Dolna, gm. Lubaczów)","Lubasy (Basznia Dolna"],["Basznia Górna","Basznia Górna (gm. Lubaczów)"],
 ["Baszni","Basznia"],["Krowica Sama","Krowica Sama"],["dabrowa","Dąbrowa (gm. Lubaczów)"],["Wolka","Wólka Krowicka (gm. Lubaczów)"],["Opaka","Opaka (gm. Lubaczów)"],
 ["Dolna","Dolna"],["lesna lisie jamy","ul. Leśna, Lisie Jamy"],["Huta","Huta Kryształowa"],
];
```

### Held-out battery (query → expected top label substring)
```js
export const heldOut = [
 ["kopernika","ul. Mikołaja Kopernika, Lubaczów"],["Kopernik","ul. Mikołaja Kopernika, Lubaczów"],
 ["Sienkiewcza","ul. Henryka Sienkiewicza, Lubaczów"],["slowackiego 7","ul. Juliusza Słowackiego, Lubaczów"],
 ["zeromskiego","ul. Stefana Żeromskiego, Lubaczów"],["Konopnicka","ul. Marii Konopnickiej, Lubaczów"],
 ["Wyszynskiego","ul. Kard. Stefana Wyszyńskiego, Lubaczów"],["kard wyszynskiego","ul. Kard. Stefana Wyszyńskiego, Lubaczów"],
 ["jagielly","ul. Władysława Jagiełły, Lubaczów"],["pileckiego","ul. rtm. Witolda Pileckiego, Lubaczów"],
 ["Sobieskiego Basznia","ul. Jana III Sobieskiego, Basznia Dolna"],["sobieskiego karolowka","ul. Jana III Sobieskiego, Karolówka"],
 ["Wojska Polskiego 15","ul. Wojska Polskiego, Lubaczów"],["37-600 Lubaczów, ul. Kolejowa 3","ul. Kolejowa, Lubaczów"],
 ["kolejowa basznia","ul. Kolejowa, Basznia Dolna"],["Kolejowa","ul. Kolejowa, Lubaczów"],
 ["Szczutkow","Szczutków (gm. Lubaczów)"],["Zaluze","Załuże (gm. Lubaczów)"],["Budomiez","Budomierz (gm. Lubaczów)"],
 ["Krowica Holodowska","Krowica Hołodowska (gm. Lubaczów)"],["Huta Krysztalowa","Huta Kryształowa (gm. Lubaczów)"],
 ["mokrzyc","Mokrzyca (gm. Lubaczów)"],["szymanskiego","ul. Dr Henryka M. Szymańskiego, Lubaczów"],
 ["Hubala","ul. Mjr. Hubala, Lubaczów"],["monte casino","ul. Monte Cassino, Lubaczów"],["westerplate","ul. Westerplatte, Lubaczów"],
 ["os jagiellonow","Osiedle Jagiellonów, Lubaczów"],["sw floriana","ul. św. Floriana, Młodów"],
 ["Krolowej Jadwigi","ul. św. Królowej Jadwigi, Lubaczów"],["ul. Piłsudskiego 4/12","ul. Józefa Piłsudskiego, Lubaczów"],
];
export const junk = ["xyzqq","qwer","zzzz"];
```

### The 330 labels (production search index, 23 Oct 2026; one per line)
```
aleja kardynała Mariana Jaworskiego, Lisie Jamy
aleja kardynała Mariana Jaworskiego, Lubaczów
Antoniki (gm. Lubaczów)
Bałaje (gm. Lubaczów)
Basznia (Basznia Dolna, gm. Lubaczów)
Basznia Górna (gm. Lubaczów)
Blusy (Krowica Sama, gm. Lubaczów)
Boble (Krowica Lasowa, gm. Lubaczów)
Borowa Góra (gm. Lubaczów)
Brzozie (Wólka Krowicka, gm. Lubaczów)
Budomierz (gm. Lubaczów)
Cetynia (Krowica Sama, gm. Lubaczów)
Cetynia Hołodowska (Krowica Hołodowska, gm. Lubaczów)
Czarne (Załuże, gm. Lubaczów)
Dąbrowa (Basznia Górna, gm. Lubaczów)
Dąbrowa (gm. Lubaczów)
Flisy (Lisie Jamy, gm. Lubaczów)
Głodówka (Krowica Hołodowska, gm. Lubaczów)
Holiki (Dąbrowa, gm. Lubaczów)
Hurcze (gm. Lubaczów)
Huta Kryształowa (gm. Lubaczów)
Kamienna (Opaka, gm. Lubaczów)
Kornagi (Dąbrowa, gm. Lubaczów)
Krause (Dąbrowa, gm. Lubaczów)
Krowica Hołodowska (gm. Lubaczów)
Krowica Lasowa (gm. Lubaczów)
Lubasy (Basznia Dolna, gm. Lubaczów)
Malce (Basznia Górna, gm. Lubaczów)
Mądre (Dąbrowa, gm. Lubaczów)
Michalce (Dąbrowa, gm. Lubaczów)
Mielniki (Krowica Hołodowska, gm. Lubaczów)
Mielniki (Szczutków, gm. Lubaczów)
Misztale (Lisie Jamy, gm. Lubaczów)
Moczar Duży (Załuże, gm. Lubaczów)
Moczar Mały (Załuże, gm. Lubaczów)
Mokrzyca (gm. Lubaczów)
Obrawczyzna (Krowica Sama, gm. Lubaczów)
Onyszczaki (Szczutków, gm. Lubaczów)
Opaka (gm. Lubaczów)
Osiedle Jagiellonów, Lubaczów
Osiedle Mickiewicza, Lubaczów
Osiedle Sołotwina, Basznia Dolna
Osiedle Sportowe, Basznia Dolna
Osiedle Unii Lubelskiej, Lubaczów
Osiedle Wolności, Krowica Sama
Osiedle Wrzosowe, Młodów
Piaski (Basznia Dolna, gm. Lubaczów)
Piastowo (gm. Lubaczów)
Pilipy (Młodów, gm. Lubaczów)
Podlesie (gm. Lubaczów)
Prewendy (Szczutków, gm. Lubaczów)
Ruda (Basznia Dolna, gm. Lubaczów)
Ruda Szczutkowska (Szczutków, gm. Lubaczów)
Smolińce (Lisie Jamy, gm. Lubaczów)
Szczutków (gm. Lubaczów)
Szutki (Dąbrowa, gm. Lubaczów)
Szymeczki (Basznia Dolna, gm. Lubaczów)
Szyszaki (Szczutków, gm. Lubaczów)
Tuczarnia (Opaka, gm. Lubaczów)
Tymce (gm. Lubaczów)
ul. 3-go Maja, Lubaczów
ul. Adama Asnyka, Lubaczów
ul. Adama Mickiewicza, Lubaczów
ul. Agenora Gołuchowskiego, Lubaczów
ul. Agrestowa, Lubaczów
ul. Akacjowa, Lubaczów
ul. Aleksandra Gierymskiego, Lubaczów
ul. Andrzeja II Węgierskiego, Lubaczów
ul. Arcybiskupa Eugeniusza Baziaka, Lubaczów
ul. Armii Krajowej, Lubaczów
ul. Artura Grottgera, Lubaczów
ul. Batalionów Chłopskich, Lubaczów
ul. Błonie, Młodów
ul. Boczna Mazury, Lubaczów
ul. Bohaterów Września 1939, Lubaczów
ul. Bolesława Chrobrego, Lubaczów
ul. Bolesława Krzywoustego, Lubaczów
ul. Bolesława Prusa, Lubaczów
ul. Brzoskwiniowa, Lubaczów
ul. Brzozowa, Lubaczów
ul. Budowlanych, Lubaczów
ul. Chabrowa, Lubaczów
ul. Cicha, Lisie Jamy
ul. Cicha, Lubaczów
ul. Cypriana Kamila Norwida, Lubaczów
ul. Czesława Miłosza, Młodów
ul. Dębowa, Lubaczów
ul. Długa, Lisie Jamy
ul. Dolna, Lubaczów
ul. Dr Henryka M. Szymańskiego, Lubaczów
ul. Dr Szczepana Kruczka, Lubaczów
ul. Dr Zygmunta Leszczyńskiego, Lubaczów
ul. Dworska, Lubaczów
ul. Działkowa, Lubaczów
ul. Elizy Orzeszkowej, Lubaczów
ul. Eugeniusza Kwiatkowskiego, Lubaczów
ul. Fabryczna, Lubaczów
ul. Fiołkowa, Lubaczów
ul. Franciszka Mazurkiewicza, Lubaczów
ul. Fryderyka Szopena, Lubaczów
ul. Gabrieli Zapolskiej, Lubaczów
ul. Gen. Antoniego Jeziorańskiego, Lubaczów
ul. Gen. Grota-Roweckiego, Lubaczów
ul. gen. Hallera, Lubaczów
ul. Gen. Józefa Kustronia, Lubaczów
ul. Gen. Przemysława Nakoniecznikoffa, Lubaczów
ul. gen. Stanisława Dąbka, Dąbków
ul. Gen. Władysława Sikorskiego, Lubaczów
ul. Grunwaldzka, Lubaczów
ul. Gruszkowa, Lubaczów
ul. Grzybowa, Lubaczów
ul. Handlowa, Lubaczów
ul. Henryka Sienkiewicza, Lubaczów
ul. Hetmana A. M. Sieniawskiego, Lubaczów
ul. Hetmana Jana Tarnowskiego, Lubaczów
ul. Hotelowa, Lubaczów
ul. Ignacego Krasickiego, Lubaczów
ul. Ignacego Mościckiego, Lubaczów
ul. Inżynierska, Lubaczów
ul. Irysowa, Lubaczów
ul. Jabłkowa, Lubaczów
ul. Jacka Malczewskiego, Lubaczów
ul. Jagodowa, Lubaczów
ul. Jana III Sobieskiego, Basznia Dolna
ul. Jana III Sobieskiego, Karolówka
ul. Jana III Sobieskiego, Lisie Jamy
ul. Jana III Sobieskiego, Lubaczów
ul. Jana Kasprowicza, Lubaczów
ul. Jana Kochanowskiego, Lubaczów
ul. Jana Matejki, Lubaczów
ul. Jana Pawła II, Młodów
ul. Jarzębinowa, Lubaczów
ul. Jasna, Lubaczów
ul. Jaśminowa, Dąbków
ul. Jaśminowa, Lubaczów
ul. Jaworowa, Lubaczów
ul. Jeżynowa, Dąbków
ul. Jęczmienna, Lubaczów
ul. Józefa Chełmońskiego, Lubaczów
ul. Józefa Conrad-Korzeniowskiego, Lubaczów
ul. Józefa Ignacego Kraszewskiego, Lubaczów
ul. Józefa Piłsudskiego, Lubaczów
ul. Józefa Pluchy, Lubaczów
ul. Juliusza Słowackiego, Lubaczów
ul. Kamila Baczyńskiego, Lubaczów
ul. Kard. Stefana Wyszyńskiego, Lubaczów
ul. Kasztanowa, Lubaczów
ul. Kasztelańska, Lubaczów
ul. Kazimierza Przerwy-Tetmajera, Lubaczów
ul. Kazimierza Wielkiego, Lubaczów
ul. Klonowa, Dąbków
ul. Klonowa, Lubaczów
ul. Kolejowa, Basznia Dolna
ul. Kolejowa, Lubaczów
ul. Kombatantów, Lubaczów
ul. Konwaliowa, Dąbków
ul. Konwaliowa, Lubaczów
ul. Krótka, Lisie Jamy
ul. Krótka, Lubaczów
ul. Krótka, Młodów
ul. ks. Bronisława Gwoździa, Lubaczów
ul. ks. Haasa Paneckiego, Lubaczów
ul. Księcia Leszka Białego, Lubaczów
ul. Księcia Władysława Opolczyka, Lubaczów
ul. Kurierów Armii Krajowej, Lubaczów
ul. Kwiatowa, Lubaczów
ul. Kwiatów Polnych, Dąbków
ul. Legionów, Lubaczów
ul. Leopolda Staffa, Lubaczów
ul. Leśna, Basznia Dolna
ul. Leśna, Lisie Jamy
ul. Leśna, Lubaczów
ul. Leśna, Młodów
ul. Leśników, Lubaczów
ul. Lipowa, Lubaczów
ul. Lwowska, Lisie Jamy
ul. Łąkowa, Lubaczów
ul. Łąkowa, Młodów
ul. Łowiecka, Lubaczów
ul. Majowa, Młodów
ul. Makowa, Dąbków
ul. Malinowa, Lubaczów
ul. Mały Łążek, Lubaczów
ul. Marii Dąbrowskiej, Lubaczów
ul. Marii Konopnickiej, Lubaczów
ul. Mazury, Lubaczów
ul. Mikołaja Kopernika, Lubaczów
ul. Mikołaja Zibura, Lubaczów
ul. Miodowa, Lubaczów
ul. Mjr. Henryka Sucharskiego, Lubaczów
ul. Mjr. Hubala, Lubaczów
ul. Młodowska, Lubaczów
ul. Monte Cassino, Lubaczów
ul. Morelowa, Lubaczów
ul. Myśliwska, Lubaczów
ul. Nadrzeczna, Lisie Jamy
ul. Narcyzowa, Lubaczów
ul. Niemirowska, Lubaczów
ul. Nowa, Karolówka
ul. Nowa, Lisie Jamy
ul. Nowa, Lubaczów
ul. Obrońców Lubaczowa, Lubaczów
ul. Obrońców Lwowa, Lubaczów
ul. Ofiar Katynia, Lubaczów
ul. Ogrodowa, Dąbków
ul. Ogrodowa, Lisie Jamy
ul. Ogrodowa, Lubaczów
ul. Okrężna, Lubaczów
ul. Ostrowiecka, Lubaczów
ul. Parkowa, Dąbków
ul. Parkowa, Lisie Jamy
ul. Parkowa, Lubaczów
ul. Partyzantów, Lubaczów
ul. Piaski, Lubaczów
ul. Piaskowa, Lubaczów
ul. Piaskowa, Młodów
ul. Pilipy, Młodów
ul. Piotra Łukasiewicza, Lubaczów
ul. Płk. Stanisława Dąbka, Lubaczów
ul. Pod Borem, Lubaczów
ul. Podleśna, Lubaczów
ul. Podzamcze, Lubaczów
ul. Pogodna, Lubaczów
ul. Polna, Lisie Jamy
ul. Polna, Lubaczów
ul. Poziomkowa, Dąbków
ul. Poziomkowa, Lubaczów
ul. Ppłk Franciszka Herzoga, Lubaczów
ul. Prof. Franciszka Misztala, Lubaczów
ul. Prof. Władysława Witwickiego, Lubaczów
ul. Przemysłowa, Lubaczów
ul. Pszennego, Lubaczów
ul. Rejtana, Lubaczów
ul. Rolna, Lubaczów
ul. Romana Dmowskiego, Lubaczów
ul. Różana, Dąbków
ul. Różana, Lubaczów
ul. rtm. Witolda Pileckiego, Lubaczów
ul. Rynek, Lubaczów
ul. Rzeczna, Lubaczów
ul. Rzeczna, Młodów
ul. Rzemieślnicza, Lubaczów
ul. Sadowa, Lubaczów
ul. Sąsiedzka, Młodów
ul. Sienna, Lubaczów
ul. Słoneczna, Lubaczów
ul. Słoneczna, Młodów
ul. Słonecznikowa, Lubaczów
ul. Smolińce, Lisie Jamy
ul. Sosnowa, Lubaczów
ul. Spokojna, Lisie Jamy
ul. Sportowa, Basznia Dolna
ul. Sportowa, Lisie Jamy
ul. Sportowa, Lubaczów
ul. Sportowa, Młodów
ul. Stanisława Dębickiego, Lubaczów
ul. Stanisława Konery, Lubaczów
ul. Stanisława Wyspiańskiego, Lubaczów
ul. Starzyny, Lubaczów
ul. Stefana Mierzwy, Basznia Dolna
ul. Stefana Żeromskiego, Lubaczów
ul. Stokrotki, Dąbków
ul. Strażacka, Lubaczów
ul. Sudel, Lubaczów
ul. Szarych Szeregów, Lubaczów
ul. Szkolna, Basznia Dolna
ul. Szkolna, Młodów
ul. Szpitalna, Lubaczów
ul. Śliwkowa, Lubaczów
ul. Św. Anny, Lubaczów
ul. św. Floriana, Młodów
ul. Św. Huberta, Lubaczów
ul. św. Królowej Jadwigi, Lubaczów
ul. Tadeusza Kościuszki, Karolówka
ul. Tadeusza Kościuszki, Lubaczów
ul. Tadeusza Kościuszki, Młodów
ul. Targowa, Lubaczów
ul. Techniczna, Lubaczów
ul. Techniczna, Młodów
ul. Towarowa, Lubaczów
ul. Tulipanowa, Lubaczów
ul. Unii Lubelskiej, Lubaczów
ul. Ustronna, Lubaczów
ul. Walecznych, Lubaczów
ul. Warszawska, Młodów
ul. Warzywna, Lubaczów
ul. Wąska, Lisie Jamy
ul. Wesoła, Lisie Jamy
ul. Wesoła, Młodów
ul. Westerplatte, Lubaczów
ul. Wiejska, Basznia Dolna
ul. Wierzbowa, Lubaczów
ul. Wincentego Witosa, Karolówka
ul. Wincentego Witosa, Lubaczów
ul. Wiosenna, Lubaczów
ul. Wiśniowa, Lubaczów
ul. Władysława Broniewskiego, Lubaczów
ul. Władysława Jagiełły, Lubaczów
ul. Władysława Łokietka, Lubaczów
ul. Wodna, Lubaczów
ul. Wodna, Młodów
ul. Wojciecha Kossaka, Lubaczów
ul. Wojewody Pakosława, Lubaczów
ul. Wojska Polskiego, Lubaczów
ul. Wrzosowa, Dąbków
ul. Wrzosowa, Lubaczów
ul. Wspólna, Karolówka
ul. Wspólna, Lisie Jamy
ul. Wspólna, Lubaczów
ul. Zacisze, Lubaczów
ul. Zbożowa, Lubaczów
ul. Zielna, Lubaczów
ul. Zielona, Lisie Jamy
ul. Zielona, Lubaczów
ul. Zielona, Młodów
ul. Zofii Nałkowskiej, Lubaczów
ul. Zygmunta Krasińskiego, Lubaczów
ul. Zygmunta Nowickiego, Lubaczów
ul. Żelichówka, Lubaczów
ul. Żniwna, Lubaczów
ul. Żuki, Dąbków
ul. Żuki, Lubaczów
ul. Żwirki i Wigury, Lubaczów
ul. Żytnia, Lubaczów
Wasie (Dąbrowa, gm. Lubaczów)
Wólka Krowicka (gm. Lubaczów)
Wychylówka (Krowica Sama, gm. Lubaczów)
Wygnańce (Lisie Jamy, gm. Lubaczów)
Załuże (gm. Lubaczów)
Żuki (Opaka, gm. Lubaczów)
```
(If the real CI fixture/production index has different ids, derive ids in the unit fixture; labels are what matter.)

## Investigate only (don't fix, report)
One live `/szukaj` call took 37.8 s (likely a cold start). Check read-only with the Vercel CLI (`--scope gdzie-zamieszkac`; e.g. `vercel logs`/`vercel inspect` on the production deployment) for /szukaj function duration and cold starts, and report findings and options in the PR body or your final report. Do not change any Vercel setting.

## Hard rules
- CI only: no local DB runs, no `npm run db:*`, no local `next build`/`npm run check:*`/`next start`/`next dev` (they read `web/.env.local`, whose `DATABASE_URL_UNPOOLED` points at the **production** database). Local `npm test`, `npx biome ci`, `npx tsc --noEmit`, `npm run config:check`, `npm install @leeoniya/ufuzzy@1.0.19` are fine.
- Never print secrets. No force-push. Do not touch `stash@{0}`. Never touch `~/projects/conaulicy`.
- Do not change Vercel settings/env vars, DNS, firewall; do not dispatch any import.
- If a safety/permission block appears, stop and report; never rephrase or split an action to get around it.
- Native browser behaviour only: no custom scroll/focus/keyboard JS; links never open new tabs. Minimal code, scope only.

## Done
Commits on `feat/robust-search` (this brief included), PR titled "Robust search: uFuzzy with a Polish layer, the same everywhere", body with pass rates (both sets, failures listed), perf numbers, bundle growth, decisions, and the cold-start findings. Wait for CI green (`gh pr checks --watch`), fix failures. Do not merge. Report the PR link, `git diff --stat origin/main`, CI duration.
