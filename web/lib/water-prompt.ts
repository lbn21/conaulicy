// The one prompt for every water source (lib/zuk-ai.ts reads with it): a
// short header of the source's own (who writes, which area), the rules,
// then the context: our places from the TERYT snapshot and the districts
// (the gazetteer, lib/districts.ts), limited to the source's area. The
// rules are general principles only; a post the model reads wrongly is a
// dry-run case and a rewrite of the whole text or a table, never a rule
// of its own. Every example name is invented. The context is byte-stable
// for the same places (sorted), so the prompt is a cacheable prefix.

import { districtLines } from "./districts.ts";
import type { WaterSource } from "./water-sources.ts";
import { listedName, type ZukPlaces } from "./zuk-resolve.ts";

const RULES = `Return one JSON object in the given schema. The header above describes this source's conventions; read every post by them.

Principles:
- Copy, never invent. locality_verbatim, street_verbatim, whole_town_verbatim, date_verbatim and note are each one continuous piece of the post, copied character for character. Never output a place or time the post does not write.
- Name each place by the listed name the post's words clearly refer to, whatever the inflection, spelling slip, prefix or phrasing, and write that name exactly as listed, brackets included. A listed part is named as that part, not as its village or a namesake elsewhere. Only a place no listed name plausibly fits stays unnamed: its listed locality with street null and street_verbatim its words, or locality null and locality_verbatim its words; suggested_places: listed names it most likely covers, else [].
- street is only a listed street or district; street_verbatim holds only the words that name it, as under Fields. Words that point to a listed place, even without its full name, make that place an item of its own. Other words the post attaches to a named place that narrow or widen it (house numbers, "w części", a stretch of a street, an unlisted hamlet or estate the post itself ties to that place, "wraz z przyległymi ulicami", "i przyległych") belong to that place: they go into its note, copied from where they start, without the place's own name and without the dash, comma or colon that joins them to it, and never become a place of their own. Never drop them, nor the place because of them. An unlisted name the post writes as a place in its own right (its own line or list entry, joined only by "i" or a comma) is not a note of its neighbour: it stays unnamed. When unsure whether a place is listed or which listed place it is, leave it unnamed rather than force a match; an unnamed place is checked by hand, a wrong match reaches the wrong residents. Words that change nothing about the extent ("wszystkie posesje") are no note.

Fields:
- post_type: "water_outage" for an interruption or limitation of the public water supply, or a change to one; "water_quality" for tap water declared unfit to drink (quality_status "warning") or declared fit again, even if only conditionally (quality_status "lifted"); else "other". quality_status is null otherwise. A post that only reports that the supply has been restored, without itself announcing or describing the interruption, is "other".
- is_past: the interruption started before the publish time (an ongoing failure too). changes_earlier_dates: the post moves, cancels or corrects a day or time the source announced earlier, in an earlier post or an earlier version of this one; only adding a new interruption is not a change.
- items: one per day and place, [] for "other". kind: "emergency" for a failure and for works to repair one, "planned" for other works, "quality" for a water_quality post (date: when the warning starts or ends; no times).
- locality: a listed name; street: a listed street or district of it, null for the whole locality. The *_verbatim fields: the post's own phrase for that place, one continuous piece, the shortest in which a resident would recognise the place. A word that names no place on its own (a connective, a bare kind of place, an inflected ending) is never the whole phrase: take the neighbouring words of the post that make it a name. Never house numbers; those stay in the note and go into houses.
- whole_town: the post says the whole town (whole_town_verbatim: its words).
- doubt: for a bare name read as a street, a listed district it may also mean; else null.
- date: YYYY-MM-DD; a day without a year is the first such day from the publish date on; a post that writes no day at all speaks of its publish date. start, end: "HH:MM", null if not written; a span across midnight is one item on its first day. end_estimated: the end is only expected.
- date_verbatim: the words that give this item's day, as written; for a day inside a written range, the whole range ("26-29.10"). null only when the post writes no day.
- houses: the house numbers the note writes, each {from, to}: a single house has "to" equal to "from", a range open at one end has "to" null. [] when the note has no numbers or limits them in any other way (even or odd only, a direction, "w części").`;

// Code-unit order, so the prompt is byte-for-byte the same for the same
// places (a cacheable prefix).
const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const sorted = (names: string[]) => [...names].sort(byCode);

/**
 * The context: the towns, villages and parts of `area` (null: all of
 * ours) by their listed names, the streets of each that has any (by TERYT
 * name, never the CECHA), then each town's districts. Throws if two
 * localities share a listed name: the gate could not tell them apart.
 */
function context(places: ZukPlaces, area: ReadonlySet<string> | null): string {
  const byId = new Map(places.localities.map((l) => [l.id, l]));
  const ours = places.localities.filter((l) => !area || area.has(l.id));
  const label = new Map(ours.map((l) => [l.id, listedName(l, byId)]));
  const names = [...label.values()];
  const twice = names.filter((n, i) => names.indexOf(n) !== i);
  if (twice.length > 0) throw new Error(`listed twice: ${twice.join(", ")}`);
  const of = (test: (l: (typeof ours)[number]) => boolean) =>
    sorted(ours.filter(test).map((l) => label.get(l.id) as string)).join(", ");
  const lines = [
    ["Towns", of((l) => l.kind === "miasto")],
    ["Villages", of((l) => l.kind !== "miasto" && !l.parentId)],
    ["Parts", of((l) => Boolean(l.parentId))],
  ]
    .filter(([, list]) => list)
    .map(([what, list]) => `${what}: ${list}`);
  const streets = new Map<string, string[]>();
  for (const s of places.streets)
    if (label.has(s.localityId))
      streets.set(s.localityId, [...(streets.get(s.localityId) ?? []), s.name]);
  const withStreets = sorted(
    [...streets.keys()].map((id) => label.get(id) as string),
  );
  const idOf = new Map([...label].map(([id, name]) => [name, id]));
  const streetLines = withStreets.map(
    (name) =>
      `${name}: ${sorted(streets.get(idOf.get(name) as string) ?? []).join(", ")}`,
  );
  const districts = sorted(
    [...new Set((places.districts ?? []).map((d) => d.localityId))]
      .filter((id) => label.has(id))
      .map((id) => label.get(id) as string),
  ).map((town) => {
    const own = (places.districts ?? []).filter(
      (d) => d.localityId === idOf.get(town),
    );
    return `Districts of ${town} (informal names, with their forms and streets):\n${districtLines(own, places.streets).join("\n")}`;
  });
  return [
    "Our places (TERYT names; a locality without a line of streets has none listed):",
    ...lines,
    "Streets:",
    ...streetLines,
    ...districts,
  ].join("\n");
}

/** The system prompt: `header`, the rules, the context of the source's area. */
export function waterPrompt(
  header: string,
  places: ZukPlaces,
  source: Pick<WaterSource, "area">,
): string {
  return `${header}\n\n${RULES}\n\n${context(places, source.area)}\n`;
}
