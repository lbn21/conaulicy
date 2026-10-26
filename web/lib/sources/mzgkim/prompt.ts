// The prompt for MZGKiM's komunikaty (lib/zuk-ai.ts reads with it, the
// shared schema): the rules (what a post is, then the items, every
// example name invented but the source's own phrases), then a context of
// the town's places from the TERYT snapshot: the town, its parts and its
// streets, then its districts (the gazetteer, lib/districts.ts). MZGKiM's posts never name the town and write the streets as
// they fall in the sentence ("przy ulicach: Niemirowskiej"); the gate takes
// both from the source's rules (lib/sources/mzgkim/index.ts).

import { districtLines } from "../../districts.ts";
import type { ZukPlaces } from "../../zuk-resolve.ts";

const RULES = `You read posts ("komunikaty") from the website of MZGKiM (Miejski Zakład Gospodarki Komunalnej i Mieszkaniowej w Lubaczowie), which supplies water in the town of Lubaczów (Poland). Most posts are not about water. First decide post_type from the whole post, then extract items only for water posts.

post_type:
- "water_outage": the post announces or reports an interruption or limitation of the public water supply: planned works ("przerwa w dostawie wody", "wyłączenie wody"), a failure ("awaria sieci wodociągowej", "brak wody", "spadek ciśnienia"), or an update, extension or change of dates of such an interruption.
- "water_quality": the post says water from the public network is unfit to drink or use, must be boiled, or is contaminated, or a water tanker is provided because of water quality: quality_status "warning". A post that lifts such a warning is also water_quality, with quality_status "lifted".
- "other": everything else, even when it mentions water: the PSZOK closed, opening hours, holidays and greetings, deratyzacja, tenders and price enquiries (even for water analysis), fees and tariffs, meter readings or replacement, and routine reports that the water is fit for use ("Informacja … o jakości wody") with no earlier warning being lifted.
- If you are unsure whether a post announces a water interruption, choose "water_outage": our code checks every date and place and drops what it cannot confirm. Never choose "water_outage" or "water_quality" for a post that only mentions water in passing.
- quality_status is null unless post_type is "water_quality".

Rules:
- One item per (day, place). A post listing several streets gets one item per street.
- A multi-day notice gets one item per day per place. A night span ("w nocy z 14 na 15 listopada … 23.00 – 03.00") is ONE item dated on the first day, start 23:00, end 03:00.
- Dates are usually written without a year ("w dniu 6 października"): take the year of the publish date, and a day earlier than the publish date is in the next year. Never guess a day that is not written.
- Times are written like "08.30 – 15.00": start "08:30", end "15:00".
- kind is "emergency" for a failure (awaria), else "planned". For an estimated restore ("przewidywane wznowienie do godz. 19.00") use that time as end.
- Never add places, dates or times that are not in the text. If something is unclear, leave it out.
- For water_quality: one item per affected place; date = the day the warning starts (or the publish date if the text says it applies now), start/end null, kind "quality". For "lifted": the day it ends.
- For post_type "other": items = [].

Place fields of an item. Every place is in the town of Lubaczów (the posts do not name it):
- A street ("przy ulicach: Wzorcowej, Próbnej", "ul. Przykładowa"): locality "Lubaczów", locality_verbatim "Lubaczów", street = its canonical name from the context list, in full and in the nominative even when the post declines or shortens it (written "Próbnej", listed "Próbna" -> "Próbna"; written "Nowakowskiego", listed "Jana Nowakowskiego" -> "Jana Nowakowskiego"), street_verbatim = the exact words of the post naming it, with its type word if written ("Próbnej", "ul. Próbnej"); never house numbers or a description.
- A limitation of a street (house numbers, "od nr 2 do nr 10", "od … w kierunku …", "w części") goes into note: ONE continuous exact quote of the post, without the brackets around it, never another street. Otherwise note is null.
- The whole town ("na terenie całego miasta", "w całym mieście"): ONE item, locality "Lubaczów", locality_verbatim "Lubaczów", street null, street_verbatim null, note null.
- A district (osiedle) from the context's district list, written as listed, in one of its forms, or "osiedle X", "os. X", "na osiedlu X" with X its name: ONE item, locality "Lubaczów", locality_verbatim "Lubaczów", street = the district's name exactly as listed, street_verbatim = the exact words of the post naming it ("osiedlu Wzorcowe", "os. Wzorcowe"), note = a limitation the post gives it, else null. Never list its streets yourself: our code knows them. A part of the town that is also on the district list is written this way.
- A district written with an obvious misspelling of a listed name ("osiedle Wzorcowo" for a listed "Osiedle Wzorcowe"): street = the district's name exactly as listed, street_verbatim = the post's exact words, misspelling kept. A name that is not plainly one of the list is never mapped to it: it is any other place not on the street list.
- Any other part of the town from the context list, also written "Osiedle X" with X such a part: locality = that part as listed (with "(Lubaczów)" where the list writes it so), locality_verbatim = the part's name exactly as written ("X"), street null, street_verbatim null, note null. It is never the street of the same name.
- "ul. X" or "ulica X" is the street X only, never the district of the same name; "ul. X, osiedle X" is both, one item each. A name written alone that is both a street and a district's name is the street.
- "X wraz z osiedlem", "X wraz z przyległymi ulicami", "X wraz z osiedlem Y": "wraz z …" is never a limitation of X. The street X is WHOLE (note null), and the estate it adds is ONE more item: street = the district from the list that the words name (by a form, or X being its name), else the words exactly as written; street_verbatim = the exact words from X to the end of the phrase ("Próbna wraz z osiedlem"); note null.
- Any other place in the town that is not on the street list ("osiedle domów jednorodzinnych na zapleczu ul. Próbnej", "bloki przy szkole"): ONE item with locality "Lubaczów", locality_verbatim "Lubaczów", street = its words exactly as written, street_verbatim = the same words, note null. It is not the street it is near: never emit it as that street, and never emit the "ul. Próbnej" inside such a description as an item of its own, even when the post breaks the line inside it.
- locality_verbatim, street_verbatim and note are always copied exactly from the text, never normalized. Never output ids or places not in the text.`;

const sorted = (names: string[]) => [...names].sort();

/**
 * The context: the town, its parts (with "(Lubaczów)" for a name used
 * elsewhere too), and its streets by their TERYT names.
 */
function context(places: ZukPlaces): string {
  const town = places.localities.find((l) => l.kind === "miasto");
  if (!town) throw new Error("no town in the places");
  const count = new Map<string, number>();
  for (const l of places.localities)
    count.set(l.name, (count.get(l.name) ?? 0) + 1);
  const parts = sorted(
    places.localities
      .filter((l) => l.parentId === town.id)
      .map((l) =>
        (count.get(l.name) ?? 0) > 1 ? `${l.name} (${town.name})` : l.name,
      ),
  );
  const streets = sorted(
    places.streets.filter((s) => s.localityId === town.id).map((s) => s.name),
  );
  const districts = districtLines(
    (places.districts ?? []).filter((d) => d.localityId === town.id),
    places.streets,
  );
  const gazetteer =
    districts.length > 0
      ? `\nDistricts of ${town.name} (osiedla: informal names TERYT does not have), each with the forms it is written in and its streets:\n${districts.join("\n")}`
      : "";
  return `Context: the places of the town in our database (TERYT).
Town (miasto): ${town.name}
Parts of the town: ${parts.join(", ")}
Streets of ${town.name} (canonical TERYT names): ${streets.join(", ")}${gazetteer}`;
}

/** The system prompt: the rules, then the context of `places`. */
export function systemPrompt(places: ZukPlaces): string {
  return `${RULES}\n\n${context(places)}\n`;
}
