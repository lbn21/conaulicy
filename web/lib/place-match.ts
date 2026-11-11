// Whether something announced for a place applies to an address: one rule
// for every module that reads a place's locality and street from its
// source (water cuts, lib/water-module.ts; power outages,
// lib/power-module.ts). Pure, so the unit tests read every case.
//
// It applies when its locality is the address's locality and it names no
// street (the whole locality) or this street; on a locality's own page,
// every one of its streets' too. A village part (a TERYT part with a
// parent) also gets everything of its village that names no street; a
// part whose addresses are all on a street of its village
// (lib/part-streets.ts) gets that street's too. Never a parent's streets
// otherwise, and never a part's on its village's page.
import { PART_STREETS } from "./part-streets.ts";
import { ZUK_PLACES } from "./zuk-places.generated.ts";

/** A place as TERYT has it: its locality (SIMC), and its street or null. */
export type PlaceRef = { localityId: string; streetId: string | null };

/** Each village part's village (the town's parts among them). */
export const PARENT = new Map<string, string>();
for (const l of ZUK_PLACES.localities)
  if (l.parentId) PARENT.set(l.id, l.parentId);

/** Whether what is announced for `place` applies to `address` (above). */
export function matches(address: PlaceRef, place: PlaceRef): boolean {
  const { localityId, streetId } = place;
  if (localityId === address.localityId)
    return (
      streetId === null ||
      address.streetId === null ||
      streetId === address.streetId
    );
  if (streetId === null) return localityId === PARENT.get(address.localityId);
  return (
    address.streetId === null &&
    (PART_STREETS.get(address.localityId)?.includes(streetId) ?? false)
  );
}
