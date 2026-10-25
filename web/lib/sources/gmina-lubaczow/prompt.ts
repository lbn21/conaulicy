// The prompt for posts of the gmina Lubaczów's site (lib/zuk-ai.ts reads
// with it): what a post is (post_type), the rules for its items, then a
// context of our own places (systemPrompt). With the rules and context
// grok-4.7 scored 330/330 place-days on 24 hand-checked posts, 0 wrong
// (A/B test, 25 Oct 2026, reasoning low, temp. 0); the post_type section
// is Jakub's (X8, 25 Oct 2026).

import type { ZukPlaces } from "../../zuk-resolve.ts";

const SYSTEM = `You read posts from the website of gmina Lubaczów (Poland). Most are not about water. First decide post_type from the whole post, then extract items only for water posts.

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
- Use the publish date only to resolve a year if missing. Do not guess.`;

const PLACE_RULES = `Place-name rules (they override 'copy locality verbatim' only for the locality field):
- locality is the town or village the text names, written exactly as in the list above. Change only case, spacing, dashes or a missing diacritic; never pick a different place.
- A name not on the list that is attached to a listed village ('Załuże–Podłęże', 'Załuże (Podłęże)'): locality = that village ('Załuże'), note = the unlisted name exactly as written ('Podłęże'). Never invent where an unlisted name lies.
- 'X (przysiółek Y)' or 'X ... (przysiółek Y)': locality = the village X; keep the bracket in place_verbatim. Example: 'Basznia Górna od nr 121 do nr 144 (przysiółek Dąbrowa)' -> locality 'Basznia Górna'.
- A bare name that is both a village and a village part (e.g. 'Dąbrowa') is the village.
- A village part named on its own, without its village: locality = the part's name.
- 'Młodów, ul. Pilipy' / 'Młodów ul. Pilipy' is the street Pilipy in Młodów: locality 'Młodów', street 'Pilipy'.
- street, place_verbatim and note are always copied exactly from the text, never normalized. Never output ids or places not in the text.`;

// Code-point order, so the prompt is byte-for-byte the same for the same
// places (a cacheable prefix).
const sorted = (names: string[]) => [...names].sort();

/**
 * The system prompt: the rules, then our localities (town, villages, village
 * parts with their village; no streets, which made the readings worse), then
 * the place-name rules. Built from the places the resolver uses, so it
 * follows the data.
 */
export function systemPrompt(places: ZukPlaces): string {
  const byId = new Map(places.localities.map((l) => [l.id, l]));
  const names = (kind: string) =>
    sorted(
      places.localities.filter((l) => l.kind === kind).map((l) => l.name),
    ).join(", ");
  const parts = sorted(
    places.localities
      .filter((l) => l.kind === "czesc_wsi")
      .map((l) => {
        const parent = l.parentId ? byId.get(l.parentId)?.name : undefined;
        return parent ? `${l.name} (${parent})` : l.name;
      }),
  ).join(", ");
  const seen = new Map<string, number>();
  for (const l of places.localities)
    seen.set(l.name, (seen.get(l.name) ?? 0) + 1);
  const twice = sorted(
    [...seen].filter(([, n]) => n > 1).map(([name]) => name),
  );
  return `${SYSTEM}

Context: the places in our database. ZUK Mokrzyca supplies water to the villages of gmina Lubaczów and to some streets of the town Lubaczów.
Town (miasto): ${names("miasto")}
Villages (wieś): ${names("wies")}
Village parts (część wsi, przysiółek), each with its village: ${parts}
Names used more than once: ${twice.join(", ")}.
${PLACE_RULES}
`;
}
