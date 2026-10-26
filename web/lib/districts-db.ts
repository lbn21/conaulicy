// The gazetteer as the database holds it (lib/districts.ts; filled by
// scripts/districts-seed.ts): what the water cron gives the prompts and
// the gate (app/api/cron/zuk/route.ts). Throws if unreadable: the run
// fails without writing, and the old file stays.
import "server-only";
import { asc } from "drizzle-orm";
import { db, districtAliases, districtAliasStreets } from "./db/index.ts";
import type { District } from "./districts.ts";

export async function loadDistricts(): Promise<District[]> {
  const [aliases, links] = await Promise.all([
    db().select().from(districtAliases).orderBy(asc(districtAliases.id)),
    db()
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
