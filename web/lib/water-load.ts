import "server-only";
import { getPlace } from "@/lib/schedule";
import { type Water, water } from "@/lib/water-module";
import { getZukData } from "@/lib/zuk-store";

// The water module's data for an address: the one loader of the /woda page
// (lib/modules.ts) and its calendar file (app/adres/[id]/woda.ics), so the
// two never disagree. null: no such place.
export async function loadWater(
  id: string,
  nr: string | null,
): Promise<Water | null> {
  const [place, view] = await Promise.all([getPlace(id, nr), getZukData()]);
  return place && water(view, place);
}
