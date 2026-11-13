// The gazetteer as the database holds it (lib/districts.ts; filled by
// scripts/districts-seed.ts): what the dataset snapshot gives the water
// cron for the prompts and the gate (scripts/lib/dataset.ts,
// app/api/cron/zuk/route.ts). Throws if unreadable.
import { asc } from "drizzle-orm";
import {
  type Db,
  districtAliases,
  districtAliasStreets,
} from "../../db/index.ts";
import type { District } from "../../lib/districts.ts";

export async function loadDistricts(db: Db): Promise<District[]> {
  const [aliases, links] = await Promise.all([
    db.select().from(districtAliases).orderBy(asc(districtAliases.id)),
    db
      .select()
      .from(districtAliasStreets)
      .orderBy(
        asc(districtAliasStreets.aliasId),
        asc(districtAliasStreets.streetId),
      ),
  ]);
  return aliases.map((a) => ({
    id: a.id,
    localityId: a.localityId,
    simc: a.terytSimc,
    name: a.name,
    variants: a.variants,
    confidence: a.confidence,
    sourceUrl: a.sourceUrl,
    streets: links
      .filter((l) => l.aliasId === a.id)
      .map((l) => ({
        id: l.streetId,
        confidence: l.confidence,
        part: l.part,
        sourceUrl: l.sourceUrl,
      })),
  }));
}
