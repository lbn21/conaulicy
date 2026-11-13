import "server-only";
import type { LiveReads } from "@/lib/live-reads";
import { getPlace } from "@/lib/schedule";
import { type Water, water } from "@/lib/water-module";

// The water module's data for an address: the one loader of the /woda page
// (lib/modules.ts) and its calendar file (app/adres/[id]/woda.ics), so the
// two never disagree. null: no such place.
export async function loadWater(
  id: string,
  reads: LiveReads,
): Promise<Water | null> {
  const [place, views] = await Promise.all([
    getPlace(id, reads.now),
    reads.water(),
  ]);
  return place && water(views, place);
}
