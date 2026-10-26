import "server-only";
import { getPlace } from "@/lib/schedule";
import { type Water, water } from "@/lib/water-module";
import { getWaterData } from "@/lib/zuk-store";

// The water module's data for an address: the one loader of the /woda page
// (lib/modules.ts) and its calendar file (app/adres/[id]/woda.ics), so the
// two never disagree. null: no such place.
export async function loadWater(
  id: string,
  nr: string | null,
): Promise<Water | null> {
  const [place, views] = await Promise.all([getPlace(id, nr), getWaterData()]);
  return place && water(views, place);
}
