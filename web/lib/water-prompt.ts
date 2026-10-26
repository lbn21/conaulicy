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
- Copy, never invent. locality_verbatim, street_verbatim, whole_town_verbatim and note are each one continuous piece of the post, copied character for character. Never output a place, day or time the post does not write.
- Name each place by the listed name the post's words clearly refer to, whatever the inflection, spelling slip, prefix or phrasing. A listed part or hamlet is named as that part, not as its village. Only a place no listed name plausibly fits stays unnamed: its listed locality with street null and street_verbatim its words, or locality null and locality_verbatim its words; suggested_places: listed names it most likely covers, else [].
- Every limitation of a place (house numbers, "w części", a stretch of a street, an unlisted part) goes into its note, quoted exactly; the note may be the whole phrase carrying it, the place's own words included. Never drop a limitation, nor the place for it.

Fields:
- post_type: "water_outage" for an interruption or limitation of the public water supply or a change to one; "water_quality" for tap water unfit to drink (quality_status "warning") or fit again ("lifted"); else "other". quality_status is null otherwise.
- is_past: the interruption started before the publish time (an ongoing failure too). changes_earlier_dates: the post moves, cancels or corrects dates the source announced earlier, in an earlier post or an earlier version of this one.
- items: one per day and place, [] for "other". kind: "emergency" for a failure, "planned" for works, "quality" for a water_quality post (date: when the warning starts or ends; no times).
- locality: a listed name; street: a listed street or district of it, null for the whole locality. The *_verbatim fields: the post's words for them, never house numbers.
- whole_town: the post says the whole town (whole_town_verbatim: its words).
- doubt: for a bare name read as a street, a listed district it may also mean; else null.
- date: YYYY-MM-DD; a day without a year is the first such day from the publish date on. start, end: "HH:MM", null if not written; a span across midnight is one item on its first day. end_estimated: the end is only expected.`;

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
