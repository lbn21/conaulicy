import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { DISTRICTS } from "../../districts-seed.ts";
import { PLACES } from "../../zuk-fixture.ts";
import { ZUK_PLACES } from "../../zuk-places.generated.ts";
import { systemPrompt } from "./prompt.ts";

const SYSTEM = systemPrompt(PLACES);

// The v3.1 prompt (task 114b, the X8 handoff's prompt-v31.md) built from
// the fixture's places: rules-v31.txt byte for byte, then the context.
const V31 = `You read posts from the website of gmina Lubaczów (Poland). Most are not about water. First decide post_type from the whole post, then extract items only for water posts.

post_type:
- "water_outage": the post announces or reports an interruption or limitation of the public water supply: planned works ("przerwa w dostawie wody", "wyłączenie wody"), a failure ("awaria sieci wodociągowej", "brak wody", "spadek ciśnienia"), or an update, extension or change of dates of such an interruption ("aktualizacja", "wydłużenie", "zmiana terminu"). The supplier may be named in any form ("ZUK", "Zakład Usług Komunalnych", "Zakładu Usług Komunalnych w Mokrzycy", "Wójt Gminy") or not at all.
- "water_quality": the post says water from the public network is unfit to drink or use, must be boiled, or is contaminated (e.g. "brak przydatności wody do spożycia", "bakterie coli", "enterokoki", "przed spożyciem przegotować"), or a temporary water point / water tanker is provided because of water quality. quality_status "warning". A post that lifts such a warning ("woda przydatna do spożycia", "odwołanie komunikatu") is also water_quality, with quality_status "lifted".
- "other": everything else, even when it mentions water: appeals to save water, heat or drought, fishing, water or sewage fees and tariffs, meter replacement ("wymiana wodomierzy"), building or investment in networks with no interruption announced, council sessions, flood or rain warnings, sewage ("kanalizacja") with no effect on water supply, and quality reports saying the water is fit for use with no earlier warning being lifted.
- If you are unsure whether a post announces a water interruption, choose "water_outage": our code checks every date and place and drops what it cannot confirm. Never choose "water_outage" or "water_quality" for a post that only mentions water in passing.
- quality_status is null unless post_type is "water_quality".

Examples (title -> post_type):
- "Przerwa w dostawie wody - Młodów i Karolówka (31.08 i 1.09.2026)" -> water_outage
- "Awaria sieci wodociągowej - Dąbrowa i Krowica Lasowa" -> water_outage
- "Aktualizacja dat - przerwa w dostawie wody Basznia Dolna" -> water_outage
- "Uwaga! Brak przydatności wody do spożycia z wodociągu w Hucie Kryształowej" -> water_quality, warning
- "Woda w Hucie Kryształowej ponownie przydatna do spożycia" -> water_quality, lifted
- "Apel o racjonalne korzystanie z wody" -> other
- "Wymiana wodomierzy w miejscowości ..." -> other
- "Zawody wędkarskie ..." -> other

Rules:
- One item per (day, locality, street). If a locality lists several streets, emit one item per street, repeating the locality.
- A multi-day notice gets one item per day per place. A night span (e.g. 'w nocy z 21.12 na 22.12, 22:00-5:00') is ONE item dated on the first day, start 22:00, end 05:00.
- 'ul.'/'ulica' after a comma belongs to the locality before it: 'Przykładów, ul. Próbna' = locality Przykładów, street Próbna. Never drop a street, house range or 'w części' qualifier.
- Never add places, dates or times that are not in the text. If something is unclear, leave it out.
- kind is 'emergency' for a failure (awaria), else 'planned'. For an estimated restore ('przewidywane wznowienie do godz. 19.00') use that time as end.
- Use the publish date only to resolve a year if missing. Do not guess.
- For water_quality: one item per affected place; date = day the warning starts (or the publish date if the text says it applies now), start/end null, kind "quality". For "lifted": items name the places where the warning ends, date = day it ends.
- For post_type "other": items = [].

Place fields of an item (v3). The names below are invented examples, not real places:
- locality: the canonical name from the context list at the end (nominative, exactly as listed), even when the post inflects it: 'w Przykładowie' -> 'Przykładów'. For a village part whose name is listed more than once, write it with its village exactly as listed, e.g. 'Górki (Wzorowo)'.
- locality_verbatim: the exact substring of the post that names this item's locality, as written (it may be inflected): 'Przykładowie'. Only the name itself, without 'w', 'miejscowości', 'ul.' or numbers. If the post also writes this locality exactly as in the context list anywhere (title or text), copy that exact form instead of an inflected one: post 'w Przykładowie … Przykładów' -> 'Przykładów'.
- street: the canonical street name from the context list for that locality (the full name as listed): written 'ul. Nowakowskiego', listed 'Jana Nowakowskiego' -> 'Jana Nowakowskiego'; written 'os. Testowe', listed 'Osiedle Testowe' -> 'Osiedle Testowe'. If the street is not on the list for that locality, write the street name as it appears in the post, without 'ul.'. null when the whole locality is meant.
- street_verbatim: the exact substring of the post that names the street, as written, with its type word if the post has one: 'ul. Nowakowskiego', 'os. Testowe', 'Wzorcowa'. null when street is null. Never include house numbers.
- When a locality is named once above or before a list of streets ('w miejscowości Przykładów:' followed by lines '- ul. Wzorcowa – …', '- ul. Próbna – …', or 'Przykładów ulice: Wzorcowa, Próbna'), every item of that list gets that locality, and locality_verbatim is that one mention.
- 'os. X' or 'osiedle X' after a comma belongs to the locality before it, as a street: 'Przykładów, os. Testowe' -> locality 'Przykładów', street 'Osiedle Testowe', street_verbatim 'os. Testowe'. Never widen it to the whole village and never use it as a locality.
- street is the name only, never house numbers. Any limitation within a street or a locality (house ranges, odd or even numbers, 'od numeru', 'w części', specific buildings, households supplied from a given station) MUST go into note, copied in the post's wording: '- ul. Przykładowa – numery nieparzyste od 1 do 15' -> street 'Przykładowa', street_verbatim 'ul. Przykładowa', note 'numery nieparzyste od 1 do 15'; 'w części miejscowości Wzorowo' -> locality 'Wzorowo', note 'w części miejscowości'; 'Wzorowo od nr 10 do nr 20' -> note 'od nr 10 do nr 20'. Otherwise note is null.
- note is ONE continuous piece of the post, copied character for character: never join separate pieces, never add, drop or reorder words. It contains only this item's limitation and never names any other place, listed or not: 'części miejscowości Wzorowo od numeru 5 do numeru 9 i Zalesie Nowe od numeru 1' -> for Wzorowo note 'od numeru 5 do numeru 9' (Zalesie Nowe is a different place, not part of the note). The only names allowed in note are the unlisted part name and the '(przysiółek …)' bracket described in the place-name rules.

Place-name rules (the names in the examples are invented):
- locality is the town or village the text names, written exactly as in the context list. Change only case, spacing, dashes or a missing diacritic; never pick a different place.
- A name not on the list that is attached to a listed village ('Wzorowo–Zagórze', 'Wzorowo (Zagórze)'): locality = that village ('Wzorowo'), note = the unlisted name exactly as written ('Zagórze'). Never invent where an unlisted name lies.
- 'X (przysiółek Y)' or 'X ... (przysiółek Y)': locality = the village X; keep the bracket in note. Example: 'Przykładów od nr 10 do nr 20 (przysiółek Górki)' -> locality 'Przykładów', note 'od nr 10 do nr 20 (przysiółek Górki)'.
- A bare name that is both a village and a village part (e.g. 'Górki', listed as a village and as a part of another village) is the village.
- A village part named on its own, without its village: locality = the part's name.
- 'Przykładów, ul. Próbna' / 'Przykładów ul. Próbna' is the street Próbna in Przykładów: locality 'Przykładów', street 'Próbna'.
- locality_verbatim, street_verbatim and note are always copied exactly from the text, never normalized. Never output ids or places not in the text.

Context: the places in our database (TERYT). ZUK Mokrzyca supplies water to the villages of gmina Lubaczów and to some streets of the town Lubaczów.
Town (miasto): Lubaczów
Villages (wieś): Antoniki, Basznia Dolna, Basznia Górna, Bałaje, Borowa Góra, Budomierz, Dąbków, Dąbrowa, Hurcze, Huta Kryształowa, Karolówka, Krowica Hołodowska, Krowica Lasowa, Krowica Sama, Lisie Jamy, Mokrzyca, Młodów, Opaka, Piastowo, Podlesie, Szczutków, Tymce, Wólka Krowicka, Załuże
Village parts (część wsi, przysiółek), each with its village: Basznia (Basznia Dolna), Blusy (Krowica Sama), Boble (Krowica Lasowa), Brzozie (Wólka Krowicka), Cetynia (Krowica Sama), Cetynia Hołodowska (Krowica Hołodowska), Czarne (Załuże), Dąbrowa (Basznia Górna), Flisy (Lisie Jamy), Głodówka (Krowica Hołodowska), Holiki (Dąbrowa), Kamienna (Opaka), Kornagi (Dąbrowa), Krause (Dąbrowa), Lubasy (Basznia Dolna), Malce (Basznia Górna), Michalce (Dąbrowa), Mielniki (Krowica Hołodowska), Mielniki (Szczutków), Misztale (Lisie Jamy), Moczar Duży (Załuże), Moczar Mały (Załuże), Mądre (Dąbrowa), Obrawczyzna (Krowica Sama), Onyszczaki (Szczutków), Piaski (Basznia Dolna), Pilipy (Młodów), Prewendy (Szczutków), Ruda (Basznia Dolna), Ruda Szczutkowska (Szczutków), Smolińce (Lisie Jamy), Szutki (Dąbrowa), Szymeczki (Basznia Dolna), Szyszaki (Szczutków), Tuczarnia (Opaka), Wasie (Dąbrowa), Wychylówka (Krowica Sama), Wygnańce (Lisie Jamy), Żuki (Opaka)
Names used more than once: Dąbrowa, Mielniki.
Streets, by locality (canonical TERYT names; a locality not listed here has no streets in TERYT):
Lubaczów: Przemysłowa, Żuki
Basznia Dolna: Jana III Sobieskiego, Kolejowa, Leśna, Osiedle Sołotwina, Osiedle Sportowe, Sportowa, Stefana Mierzwy, Szkolna, Wiejska
Dąbków: Jaśminowa, Jeżynowa, Klonowa, Konwaliowa, Kwiatów Polnych, Makowa, Ogrodowa, Parkowa, Poziomkowa, Różana, Stokrotki, Wrzosowa, gen. Stanisława Dąbka, Żuki
Karolówka: Jana III Sobieskiego, Nowa, Tadeusza Kościuszki, Wincentego Witosa, Wspólna
Krowica Sama: Osiedle Wolności
Lisie Jamy: Cicha, Długa, Jana III Sobieskiego, Krótka, Leśna, Lwowska, Nadrzeczna, Nowa, Ogrodowa, Parkowa, Polna, Smolińce, Spokojna, Sportowa, Wesoła, Wspólna, Wąska, Zielona, aleja kardynała Mariana Jaworskiego
Młodów: Błonie, Czesława Miłosza, Jana Pawła II, Krótka, Leśna, Majowa, Osiedle Wrzosowe, Piaskowa, Pilipy, Rzeczna, Sportowa, Szkolna, Sąsiedzka, Słoneczna, Tadeusza Kościuszki, Techniczna, Warszawska, Wesoła, Wodna, Zielona, Łąkowa, św. Floriana
`;

test("prompt: v3.1, the rules then the context of our places (fixture)", () => {
  assert.equal(SYSTEM, V31);
});

test("prompt: the full TERYT snapshot gives the measured v3.1 prompt", () => {
  // system_prompt_v31.txt of the handoff: 14,125 bytes.
  const full = systemPrompt(ZUK_PLACES);
  assert.equal(Buffer.byteLength(full, "utf8"), 14_125);
  assert.equal(
    createHash("sha256").update(full, "utf8").digest("hex"),
    "b8675dd3480afe3d2186049a2c0fbb5ef11331c8c2756c738d54233c5d6faba6",
  );
});

test("prompt: the same in any order, streets by TERYT name, no CECHA, no ids", () => {
  for (const places of [PLACES, ZUK_PLACES]) {
    const reversed = {
      localities: [...places.localities].reverse(),
      streets: [...places.streets].reverse(),
    };
    assert.equal(systemPrompt(reversed), systemPrompt(places));
  }
  const context = SYSTEM.slice(SYSTEM.indexOf("\n\nContext: "));
  assert.match(context, /\nKarolówka: Jana III Sobieskiego, Nowa,/);
  assert.match(context, /\nKrowica Sama: Osiedle Wolności\n/);
  assert.ok(!/(?:^|[ :,])(?:ul|os|al)\. /.test(context));
  assert.ok(!/\d{7}/.test(SYSTEM));
  assert.ok(SYSTEM.endsWith("św. Floriana\n"));
});

test("prompt: a locality with streets must not share its name", () => {
  const twin = {
    localities: [
      ...PLACES.localities,
      {
        id: "9999999",
        name: "Karolówka",
        kind: "czesc_wsi" as const,
        parentId: "0606286",
      },
    ],
    streets: PLACES.streets,
  };
  assert.throws(() => systemPrompt(twin), /shared name: Karolówka/);
});

test("prompt: follows the data", () => {
  const more = {
    ...PLACES,
    localities: [
      ...PLACES.localities,
      {
        id: "9999999",
        name: "Nowa Wieś",
        kind: "wies" as const,
        parentId: null,
      },
      {
        id: "9999998",
        name: "Opaka",
        kind: "czesc_wsi" as const,
        parentId: "9999999",
      },
    ],
  };
  const prompt = systemPrompt(more);
  assert.match(
    prompt,
    /Villages \(wieś\): .*Mokrzyca, Młodów, Nowa Wieś, Opaka,/,
  );
  assert.match(prompt, /, Opaka \(Nowa Wieś\),/);
  assert.match(prompt, /Names used more than once: Dąbrowa, Mielniki, Opaka\./);
});

test("the gazetteer: appended to the context, the rules byte for byte", () => {
  const withDistricts = systemPrompt({ ...ZUK_PLACES, districts: DISTRICTS });
  const plain = systemPrompt(ZUK_PLACES);
  // Everything before stays; the districts follow the streets.
  assert.ok(withDistricts.startsWith(plain.trimEnd()));
  const added = withDistricts.slice(plain.trimEnd().length);
  assert.match(
    added,
    /^\nDistricts of the town Lubaczów \(osiedla: informal names TERYT does not have\)\. A district written in the post .*"ul\. X" is the street X, never the district:\n- Niwki; forms: Niwkach; no streets\n/,
  );
  assert.match(added, /\n- Osiedle Mazury; forms: os\. Mazury, /);
  assert.ok(withDistricts.endsWith("\n"));
});
