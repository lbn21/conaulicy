// The waste import's two prompts (task 191), exactly as the dry run sent
// them: an instruction part per layout, verbatim (Jakub's text: never edited
// here; a change needs a new dry run), then one line per listed place from
// the TERYT snapshot the water reader uses (lib/zuk-places.generated.ts),
// sorted by name in plain code-unit order. prompts.test.ts pins the sha256
// of both parts and of both assembled prompts.
import { ZUK_PLACES } from "../../../lib/zuk-places.generated.ts";
import type { ZukPlaces } from "../../../lib/zuk-resolve.ts";

export type Layout = "gmina" | "miasto";

/** The town of Lubaczów (SIMC): its streets are the city's listed places. */
export const TOWN_SIMC = "0972447";

/** Up to and including the header line before the list. */
export const INSTRUCTIONS: Record<Layout, string> = {
  gmina: `Read the waste collection schedule of Gmina Lubaczów in the attached image.
Respond with one JSON object only, no other text, in exactly this shape:
{"sector": <the sector number the schedule prints, or null if it prints none>,
 "year": <the year the schedule prints>,
 "months": [<the 12 month headers, copied exactly as printed, in printed order>],
 "places": [{"as_written": "<one place, exactly as printed>", "id": "<its id from the list below, or null>"}],
 "rows": {"zmieszane+bio": [<entries>], "selektywne": [<entries>], "wielkogabarytowe": [<entries>]},
 "unplaced": [{"row": "<row key>", "day": <day number>}]}

The table has one line per month and one column per waste type. The waste types, left to right, are: zmieszane+bio (mixed and bio waste); selektywne (selectively collected waste); wielkogabarytowe (bulky waste).

Each entry is one printed date: {"month": <1 to 12, the position of its month line counted from the first>, "month_header": "<the month name printed on that line, exactly as in months>", "day": <the day number printed>}. List the entries of a waste type in printed order. A month with no date for a waste type, or with only a dash, has no entry.

How to place a date in its month: for every date, follow its line straight across to the month name printed on the same line, and check that it lines up with the dates of the same line in the other columns. Never place a date by its order among the dates of its column, only by the line it stands on. If a date cannot be placed in one month with certainty, do not put it in the rows; put it in unplaced instead.

places: every place the schedule's table lists, in printed order, one entry each. as_written is that place's name copied character for character as printed, letter case included, without the separators between names.
id: the id of the listed locality the printed name clearly is. When no listed locality fits, or more than one could, id is null: a null is checked by a person, a wrong id sends dates to the wrong residents.
Listed localities (id name):
`,
  miasto: `Read the waste collection schedule of the town of Lubaczów in the attached image.
Respond with one JSON object only, no other text, in exactly this shape:
{"sector": <the sector number the schedule prints, or null if it prints none>,
 "year": <the year the schedule prints>,
 "months": [<the 12 month column headers, copied exactly as printed, left to right>],
 "places": [{"as_written": "<one street, exactly as printed>", "id": "<its id from the list below, or null>"}],
 "rows": {"zmieszane+popiol": [<entries>], "papier+tworzywa_metale+szklo": [<entries>], "bio": [<entries>], "wielkogabarytowe+elektro+opony+tekstylia": [<entries>]},
 "unplaced": [{"row": "<row key>", "day": <day number>}]}

The table has one column per month and one band per waste type. The bands, top to bottom, are: zmieszane+popiol (mixed waste and ash); papier+tworzywa_metale+szklo (paper, plastics and metal, glass); bio (biodegradable waste); wielkogabarytowe+elektro+opony+tekstylia (bulky waste, electrical equipment, tyres, textiles).

Each entry is one printed date: {"month": <1 to 12, the position of its month column counted from the left>, "month_header": "<the header printed at the top of that column, exactly as in months>", "above": <the date printed in the band directly above this one, in the same column, closest to this date, or null if that cell is empty or this is the top band>, "day": <the day number printed>}. List the entries of a band in left-to-right order. A month with no date in a band has no entry.

How to place a date in its month: find the column first, then read the day. Some bands have cell borders; others are one coloured strip where a date stands alone with empty space beside it, and there a date is easily put one column off. For every date, look straight up from its centre: the first date you meet in the band above is "above", and the header you reach at the top is its month. Confirm by counting columns from the left edge of the table. Never place a date by its order among the dates of its band, only by its position under a header. If the column of a date is not certain, do not put it in the band; put it in unplaced instead.

places: every street the schedule lists, in printed order, one entry each. as_written is that street's name copied character for character as printed, without the separators between names.
id: the id of the listed street the printed name clearly is, whatever the abbreviation, title or word order. When no listed street fits, or more than one could, id is null: a null is checked by a person, a wrong id sends dates to the wrong residents.
Listed streets of Lubaczów (id name):
`,
};

const byName = (a: { name: string }, b: { name: string }) =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0;

/**
 * The places a prompt lists, in its order: gmina the villages (kind wies;
 * village parts are not listed), "<SIMC> <name>"; miasto the town's
 * streets, "<SYM_UL> <CECHA> <name>". id: what the model may answer.
 */
export function listedPlaces(
  layout: Layout,
  places: ZukPlaces = ZUK_PLACES,
): Array<{ id: string; line: string }> {
  if (layout === "gmina")
    return places.localities
      .filter((l) => l.kind === "wies")
      .sort(byName)
      .map((l) => ({ id: l.id, line: `${l.id} ${l.name}\n` }));
  // A street id is "<SIMC>-<SYM_UL>" (TERYT snapshot ids, not source text).
  const prefix = `${TOWN_SIMC}-`;
  return places.streets
    .filter((s) => s.localityId === TOWN_SIMC)
    .sort(byName)
    .map((s) => {
      const id = s.id.slice(prefix.length);
      return { id, line: `${id} ${s.cecha} ${s.name}\n` };
    });
}

/** The prompt sent with one schedule image, and the ids it lists. */
export function schedulePrompt(
  layout: Layout,
  places: ZukPlaces = ZUK_PLACES,
): { text: string; ids: string[] } {
  const listed = listedPlaces(layout, places);
  return {
    text: INSTRUCTIONS[layout] + listed.map((p) => p.line).join(""),
    ids: listed.map((p) => p.id),
  };
}
