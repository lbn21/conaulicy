// The TERYT reload's places, reviewed first (docs/import.md, "TERYT
// reload"): what `npm run db:import -- --teryt` would change in our places,
// as a review file, etl/review/teryt/places.yaml, which a person checks in
// a pull request; --apply applies only the plan that file was made for,
// once merged into main. Places are never deleted: one TERYT no longer
// lists is retired (streets.retired_at, localities.retired_at), and its
// address answers 308 to the place that replaced it, if the review names
// one, or says it is gone. Pure: scripts/import.ts reads and writes.
import { createHash } from "node:crypto";
import { parse as parseYaml, stringify as toYaml } from "yaml";
import { normalize } from "../../lib/normalize.ts";
import { pickZone, streetName, type ZoneCandidate } from "../../lib/places.ts";

/** The review file, relative to the repository root. */
export const PLACE_REVIEW_FILE = "etl/review/teryt/places.yaml";

/** More than this share of current places retired at once blocks --apply. */
const RETIRE_LIMIT = 0.1;

/** A street or locality as the database holds it, or the import makes it. */
export type PlaceRow = {
  id: string;
  name: string;
  /** Streets: TERYT CECHA. */
  prefix?: string;
  /** Streets: the locality (SIMC). */
  localityId?: string;
  /** Localities. */
  kind?: "miasto" | "wies" | "czesc_wsi";
  gminaId?: string;
  parentId?: string | null;
  retiredAt?: string | null;
  replacedBy?: string | null;
};

type Places = { streets: PlaceRow[]; localities: PlaceRow[] };

type AddedPlace = {
  id: string;
  name: string;
  /** Its waste zone, or null: no schedule. */
  zone: string | null;
};

type RetiredPlace = {
  id: string;
  name: string;
  /** The rename, when exactly one new place has its name in its locality. */
  replacedBy: string | null;
  /** New places in its locality (gmina, for a village) with a like name. */
  candidates: string[];
};

export type PlacePlan = {
  added: AddedPlace[];
  retired: RetiredPlace[];
  /** Retired before, listed by TERYT again. */
  restored: Array<{ id: string; name: string }>;
  /** Current places now (streets and villages), for RETIRE_LIMIT. */
  current: number;
  /** Of the plan's facts: a review is for this exact plan. */
  sha256: string;
};

const isCurrent = (p: PlaceRow) => !p.retiredAt;

function label(place: PlaceRow, localities: Map<string, PlaceRow>): string {
  if (place.prefix === undefined) return place.name;
  const locality = localities.get(place.localityId ?? "");
  return `${streetName(place.prefix, place.name)} (${locality?.name ?? place.localityId})`;
}

/**
 * Like names: the same words, or one's words the end of the other's
 * ("Mickiewicza" and "Adama Mickiewicza").
 */
function alike(a: string, b: string): "same" | "like" | null {
  const x = normalize(a);
  const y = normalize(b);
  if (x === y) return "same";
  return x.endsWith(` ${y}`) || y.endsWith(` ${x}`) ? "like" : null;
}

/** Where a place is looked up for a rename: its locality, or a village's gmina. */
const scope = (p: PlaceRow) => p.localityId ?? `gmina:${p.gminaId}`;

/**
 * The waste zone a new place gets from the new zone members: its own, its
 * locality's or its village's (lib/places.ts pickZone).
 */
function zoneOf(
  place: PlaceRow,
  members: ZoneCandidate[],
  localities: Map<string, PlaceRow>,
): string | null {
  const isStreet = place.prefix !== undefined;
  const localityId = isStreet ? (place.localityId as string) : place.id;
  const zonePlace = {
    localityId,
    parentId: localities.get(localityId)?.parentId ?? null,
    ...(isStreet && { streetId: place.id }),
  };
  return pickZone(members, zonePlace);
}

/**
 * What the reload does to our places: `current` as the database holds them
 * (retired ones too), `next` as the import would write them, `members`
 * the waste zones' members it would write.
 */
export function planPlaces(
  current: Places,
  next: Places,
  members: ZoneCandidate[],
): PlacePlan {
  const localities = new Map(
    [...current.localities, ...next.localities].map((l) => [l.id, l]),
  );
  // A town is no place (its streets are); its villages and parts are.
  const isPlace = (p: PlaceRow) => p.kind !== "miasto";
  const before = [...current.streets, ...current.localities].filter(isPlace);
  const after = [...next.streets, ...next.localities].filter(isPlace);
  const known = new Map(before.map((p) => [p.id, p]));
  const listed = new Set(after.map((p) => p.id));

  const added = after.filter((p) => !known.has(p.id));
  const gone = before.filter((p) => isCurrent(p) && !listed.has(p.id));
  const restored = after.filter((p) => {
    const old = known.get(p.id);
    return old !== undefined && !isCurrent(old);
  });

  // A rename: the one new place with the same name in the same locality,
  // when no other gone place has that name there too. Anything less clear
  // is left to the review: candidates, never a guess.
  const matches = new Map(
    gone.map((g) => [
      g.id,
      added
        .filter(
          (a) =>
            scope(a) === scope(g) &&
            (a.prefix === undefined) === (g.prefix === undefined),
        )
        .map((a) => ({ id: a.id, how: alike(a.name, g.name) }))
        .filter((m) => m.how !== null),
    ]),
  );
  const sameCount = new Map<string, number>();
  for (const list of matches.values())
    for (const m of list)
      if (m.how === "same") sameCount.set(m.id, (sameCount.get(m.id) ?? 0) + 1);

  const byId = (a: { id: string }, b: { id: string }) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  const plan = {
    added: added
      .map((p) => ({
        id: p.id,
        name: label(p, localities),
        zone: zoneOf(p, members, localities),
      }))
      .sort(byId),
    retired: gone
      .map((g) => {
        const list = matches.get(g.id) ?? [];
        const same = list.filter((m) => m.how === "same");
        const sure =
          same.length === 1 &&
          list.length === 1 &&
          sameCount.get(same[0].id) === 1;
        return {
          id: g.id,
          name: label(g, localities),
          replacedBy: sure ? same[0].id : null,
          candidates: list.map((m) => m.id).sort(),
        };
      })
      .sort(byId),
    restored: restored
      .map((p) => ({ id: p.id, name: label(p, localities) }))
      .sort(byId),
    current: before.filter(isCurrent).length,
  };
  const sha256 = createHash("sha256")
    .update(
      JSON.stringify({
        added: plan.added.map(({ id, zone }) => [id, zone]),
        retired: plan.retired.map(({ id, candidates }) => [id, candidates]),
        restored: plan.restored.map(({ id }) => id),
      }),
    )
    .digest("hex");
  return { ...plan, sha256 };
}

export const hasPlaceChanges = (plan: PlacePlan) =>
  plan.added.length + plan.retired.length + plan.restored.length > 0;

/** New places without a waste zone: each blocks --apply. */
export const unzoned = (plan: PlacePlan) =>
  plan.added.filter((p) => p.zone === null);

/** The review file for a plan (Polish notes for the reviewer, as the waste reviews). */
export function placeReviewYaml(plan: PlacePlan, made: string): string {
  const doc = {
    sha256: plan.sha256,
    made,
    added: plan.added,
    retired: plan.retired.map((r) => ({
      id: r.id,
      name: r.name,
      replaced_by: r.replacedBy,
      candidates: r.candidates,
    })),
    restored: plan.restored,
  };
  return [
    "# Przegląd zmian miejsc z TERYT (docs/import.md, „TERYT reload”).",
    "# Scal (merge) = zatwierdzam ten plan; potem `npm run db:import -- ... --apply`.",
    "# retired: miejsca, których TERYT już nie ma. Nigdy nie są usuwane.",
    "#   replaced_by: nowe miejsce po zmianie nazwy (adres przekieruje 308),",
    "#   albo null: strona powie, że ulicy już nie ma. Wpisz je tylko na pewno,",
    "#   najlepiej jedno z candidates.",
    "# added: nowe miejsca i ich strefa odbioru; zone: null blokuje import.",
    "# Nie zmieniaj sha256: plan dotyczy dokładnie tego stanu.",
    toYaml(doc, { lineWidth: 0 }).trimEnd(),
    "",
  ].join("\n");
}

export type PlaceReview = { replacedBy: Map<string, string | null> };

/**
 * The merged review's decisions for `plan`, or why it cannot be applied:
 * made for another plan, or a replacement that is not a current place.
 */
export function readPlaceReview(
  text: string | null,
  plan: PlacePlan,
  next: Places,
): { review: PlaceReview | null; errors: string[] } {
  if (text === null)
    return {
      review: null,
      errors: [
        `No merged ${PLACE_REVIEW_FILE} on main: run the dry run, open a PR with the file it writes, merge it, then --apply.`,
      ],
    };
  const doc = (parseYaml(text) ?? {}) as {
    sha256?: string;
    retired?: Array<{ id?: string; replaced_by?: string | null }>;
  };
  if (doc.sha256 !== plan.sha256)
    return {
      review: null,
      errors: [
        `${PLACE_REVIEW_FILE} on main was made for another plan (sha256 ${String(doc.sha256).slice(0, 12)}…, now ${plan.sha256.slice(0, 12)}…): run the dry run again and review the new file.`,
      ],
    };
  const errors: string[] = [];
  const currentIds = new Set(
    [
      ...next.streets,
      ...next.localities.filter((l) => l.kind !== "miasto"),
    ].map((p) => p.id),
  );
  const replacedBy = new Map<string, string | null>();
  for (const r of plan.retired) {
    const entry = doc.retired?.find((x) => x.id === r.id);
    if (!entry) {
      errors.push(`${PLACE_REVIEW_FILE}: ${r.id} is missing from retired.`);
      continue;
    }
    const to = entry.replaced_by ?? null;
    if (to !== null && !currentIds.has(to))
      errors.push(
        `${PLACE_REVIEW_FILE}: ${r.id} replaced_by ${to}, which is no current place.`,
      );
    replacedBy.set(r.id, to);
  }
  return { review: errors.length ? null : { replacedBy }, errors };
}

/** Why --apply must not run this plan; empty when it may. */
export function applyBlockers(
  plan: PlacePlan,
  { allowMassRetire = false }: { allowMassRetire?: boolean } = {},
): string[] {
  const blockers: string[] = [];
  for (const p of unzoned(plan))
    blockers.push(
      `New place ${p.id} ${p.name} has no waste zone: the ETL's zones must cover it (no place without its schedule).`,
    );
  if (
    !allowMassRetire &&
    plan.current > 0 &&
    plan.retired.length / plan.current > RETIRE_LIMIT
  )
    blockers.push(
      `Would retire ${plan.retired.length} of ${plan.current} places (over ${RETIRE_LIMIT * 100}%): check the TERYT files and the ETL first; if it is right, add --allow-mass-retire.`,
    );
  return blockers;
}
