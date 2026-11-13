import "server-only";
import type { LiveReads } from "@/lib/live-reads";
import { type Power, power } from "@/lib/power-module";
import { getPlace } from "@/lib/schedule";

// The power module's data for an address (lib/modules.ts): the place and
// PGE's last good copy, read at once. null: no such place, or no copy yet.
export async function loadPower(
  id: string,
  reads: LiveReads,
): Promise<Power | null> {
  const [place, copy] = await Promise.all([
    getPlace(id, reads.now),
    reads.pge(),
  ]);
  return place && power(copy, place, reads.now);
}
