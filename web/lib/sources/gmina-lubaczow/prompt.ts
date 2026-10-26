// The prompt for posts of the gmina Lubaczów's site (lib/zuk-ai.ts reads
// with it), v3.1: the rules (what a post is, post_type, Jakub's X8 text;
// the item and place-name rules, every example name invented), then a
// context of our own places built from the TERYT snapshot (systemPrompt):
// the town, villages, village parts and every street per locality, then
// the town's districts if given (the gazetteer, lib/districts.ts). The
// rules are a fixed prefix, the context last. Measured offline on 263 real
// posts (task 114b): 263/263 classified, 0 wrong places.

import { districtLines } from "../../districts.ts";
import type { ZukPlaces } from "../../zuk-resolve.ts";

/** rules-v31.txt, byte for byte (8,029 bytes, no trailing newline). */
const RULES = `You read posts from the website of gmina Lubaczów (Poland). Most are not about water. First decide post_type from the whole post, then extract items only for water posts.

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
- locality_verbatim, street_verbatim and note are always copied exactly from the text, never normalized. Never output ids or places not in the text.`;

// Code-unit order, so the prompt is byte-for-byte the same for the same
// places (a cacheable prefix).
const sorted = (names: string[]) => [...names].sort();
const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The context: the town, villages, village parts with their village, names
 * used more than once, then the streets of each locality that has any (the
 * town first, then by name and id), each by its TERYT name (NAZWA_2
 * NAZWA_1, never the CECHA). Throws if a locality with streets shares its
 * name: its line would not say which one.
 */
function context(places: ZukPlaces): string {
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
  const streets = new Map<string, string[]>();
  for (const s of places.streets)
    streets.set(s.localityId, [...(streets.get(s.localityId) ?? []), s.name]);
  const order = [...streets.keys()]
    .map((id) => {
      const l = byId.get(id);
      if (!l) throw new Error(`streets of an unknown locality ${id}`);
      return l;
    })
    .sort(
      (a, b) =>
        Number(a.kind !== "miasto") - Number(b.kind !== "miasto") ||
        byCode(a.name, b.name) ||
        byCode(a.id, b.id),
    );
  for (const l of order)
    if ((seen.get(l.name) ?? 0) > 1)
      throw new Error(`streets of a shared name: ${l.name}`);
  const lines = order.map(
    (l) => `${l.name}: ${sorted(streets.get(l.id) ?? []).join(", ")}`,
  );
  // The town's districts (the gazetteer, lib/districts.ts), if given: the
  // rules above stay as they are, so the line says how to read one.
  const town = places.localities.find((l) => l.kind === "miasto");
  const districts = town
    ? districtLines(
        (places.districts ?? []).filter((d) => d.localityId === town.id),
        places.streets,
      )
    : [];
  const gazetteer =
    town && districts.length > 0
      ? `\nDistricts of the town ${town.name} (osiedla: informal names TERYT does not have). A district written in the post (as listed, in one of its forms, or "osiedle X", "os. X" with X its name) is ONE item: locality "${town.name}", street = the district's name as listed, street_verbatim = the post's exact words; never its streets unless the post names them. "ul. X" is the street X, never the district:\n${districts.join("\n")}`
      : "";
  return `Context: the places in our database (TERYT). ZUK Mokrzyca supplies water to the villages of gmina Lubaczów and to some streets of the town Lubaczów.
Town (miasto): ${names("miasto")}
Villages (wieś): ${names("wies")}
Village parts (część wsi, przysiółek), each with its village: ${parts}
Names used more than once: ${twice.join(", ")}.
Streets, by locality (canonical TERYT names; a locality not listed here has no streets in TERYT):
${lines.join("\n")}${gazetteer}`;
}

/** The system prompt: the rules, then the context of `places`. */
export function systemPrompt(places: ZukPlaces): string {
  return `${RULES}\n\n${context(places)}\n`;
}
