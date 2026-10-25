import assert from "node:assert/strict";
import { test } from "node:test";
import { PLACES } from "../../zuk-fixture.ts";
import { systemPrompt } from "./prompt.ts";

const SYSTEM = systemPrompt(PLACES);

// The prompt as sent: the A/B test's design B (25 Oct 2026, 330/330
// place-days on the 24 hand-checked posts, 0 wrong), its first line and
// last rule replaced by Jakub's post_type section (X8, task 114).
const DESIGN_B = `You read posts from the website of gmina Lubaczów (Poland). Most are not about water. First decide post_type from the whole post, then extract items only for water posts.

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
- 'ul.'/'ulica' after a comma belongs to the locality before it: 'Młodów, ul. Pilipy' = locality Młodów, street Pilipy. Never drop a street, house range or 'w części' qualifier.
- place_verbatim is copied exactly from the text, the shortest phrase that contains the locality and this item's street, plus its house numbers, '(przysiółek …)' or other bracket if any: 'Młodów – ul. Warszawska, Rzeczna' for the street Rzeczna, 'ul. Przemysłowa (Lubaczów)', 'w części miejscowości Bałaje'.
- note: a qualifier that narrows the place ('w części miejscowości', 'gospodarstwa zasilane z SUW Mokrzyca'), copied exactly; otherwise null.
- Copy locality and street verbatim from the text (keep Polish diacritics). Never add places, dates or times that are not in the text. If something is unclear, leave it out.
- kind is 'emergency' for a failure (awaria), else 'planned'. For an estimated restore ('przewidywane wznowienie do godz. 19.00') use that time as end.
- Use the publish date only to resolve a year if missing. Do not guess.

Context: the places in our database. ZUK Mokrzyca supplies water to the villages of gmina Lubaczów and to some streets of the town Lubaczów.
Town (miasto): Lubaczów
Villages (wieś): Antoniki, Basznia Dolna, Basznia Górna, Bałaje, Borowa Góra, Budomierz, Dąbków, Dąbrowa, Hurcze, Huta Kryształowa, Karolówka, Krowica Hołodowska, Krowica Lasowa, Krowica Sama, Lisie Jamy, Mokrzyca, Młodów, Opaka, Piastowo, Podlesie, Szczutków, Tymce, Wólka Krowicka, Załuże
Village parts (część wsi, przysiółek), each with its village: Basznia (Basznia Dolna), Blusy (Krowica Sama), Boble (Krowica Lasowa), Brzozie (Wólka Krowicka), Cetynia (Krowica Sama), Cetynia Hołodowska (Krowica Hołodowska), Czarne (Załuże), Dąbrowa (Basznia Górna), Flisy (Lisie Jamy), Głodówka (Krowica Hołodowska), Holiki (Dąbrowa), Kamienna (Opaka), Kornagi (Dąbrowa), Krause (Dąbrowa), Lubasy (Basznia Dolna), Malce (Basznia Górna), Michalce (Dąbrowa), Mielniki (Krowica Hołodowska), Mielniki (Szczutków), Misztale (Lisie Jamy), Moczar Duży (Załuże), Moczar Mały (Załuże), Mądre (Dąbrowa), Obrawczyzna (Krowica Sama), Onyszczaki (Szczutków), Piaski (Basznia Dolna), Pilipy (Młodów), Prewendy (Szczutków), Ruda (Basznia Dolna), Ruda Szczutkowska (Szczutków), Smolińce (Lisie Jamy), Szutki (Dąbrowa), Szymeczki (Basznia Dolna), Szyszaki (Szczutków), Tuczarnia (Opaka), Wasie (Dąbrowa), Wychylówka (Krowica Sama), Wygnańce (Lisie Jamy), Żuki (Opaka)
Names used more than once: Dąbrowa, Mielniki.
Place-name rules (they override 'copy locality verbatim' only for the locality field):
- locality is the town or village the text names, written exactly as in the list above. Change only case, spacing, dashes or a missing diacritic; never pick a different place.
- A name not on the list that is attached to a listed village ('Załuże–Podłęże', 'Załuże (Podłęże)'): locality = that village ('Załuże'), note = the unlisted name exactly as written ('Podłęże'). Never invent where an unlisted name lies.
- 'X (przysiółek Y)' or 'X ... (przysiółek Y)': locality = the village X; keep the bracket in place_verbatim. Example: 'Basznia Górna od nr 121 do nr 144 (przysiółek Dąbrowa)' -> locality 'Basznia Górna'.
- A bare name that is both a village and a village part (e.g. 'Dąbrowa') is the village.
- A village part named on its own, without its village: locality = the part's name.
- 'Młodów, ul. Pilipy' / 'Młodów ul. Pilipy' is the street Pilipy in Młodów: locality 'Młodów', street 'Pilipy'.
- street, place_verbatim and note are always copied exactly from the text, never normalized. Never output ids or places not in the text.
`;

test("prompt: design B with the post_type section, its place list from our places", () => {
  assert.equal(SYSTEM, DESIGN_B);
});

test("prompt: the same for the same places in any order, no streets, no ids", () => {
  const shuffled = {
    localities: [...PLACES.localities].reverse(),
    streets: [...PLACES.streets].reverse(),
  };
  assert.equal(systemPrompt(shuffled), SYSTEM);
  assert.ok(!SYSTEM.includes("Sobieskiego"));
  assert.ok(!/\d{7}/.test(SYSTEM));
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
