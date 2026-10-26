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

const RULES = `Read the post and return one JSON object in the given schema.

Principles:
- Copy, never invent. locality_verbatim, street_verbatim, whole_town_verbatim and note are each one continuous piece of the post (title or text), copied character for character. Never output a place, day or time the post does not write.
- Name places only as the list below names them, exactly as listed, whatever form the post uses. Whether a name is a village, a part, a street or a district, and which locality a street belongs to, follows from the list and from how the post attaches it.
- Put every limitation of a place (house numbers, a part, a hamlet, "w części", a stretch of a street) in that place's note, quoted exactly; never drop one. A place you cannot note as one quote is a place you cannot name (below).
- A place you cannot name as listed is still returned: its listed locality with street null and street_verbatim its words, or, with no listed locality, locality null and locality_verbatim its words; suggested_places: the listed names it most likely covers, else [].
- Our code checks every listed name, every copied piece, day and time, and rejects what does not match.

Fields:
- post_type: "water_outage" for an interruption or limitation of the public water supply, announced, reported or rescheduled; "water_quality" for tap water declared unfit to drink or use (quality_status "warning") or fit again ("lifted"); otherwise "other". If unsure between "water_outage" and "other", choose "water_outage".
- items: one per day and place, [] for "other". kind: "emergency" for a failure, "planned" for works, "quality" for a water_quality post (date the day the warning starts or ends, no times).
- locality, street: the listed names; street is a listed street or district of that locality, null for the whole locality. The *_verbatim fields: the post's words for them; street_verbatim never includes house numbers.
- whole_town: the post says the whole town, in the words given in whole_town_verbatim; the town is never whole otherwise.
- doubt: for a bare name read as a street, the listed district it may also mean, else null.
- date: YYYY-MM-DD; a day written without a year is the first such day from the publish date on. start, end: "HH:MM", null if not written; a span across midnight is one item on its first day.`;

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
