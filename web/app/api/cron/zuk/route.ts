import { revalidateTag } from "next/cache";
import { loadDistricts } from "@/lib/districts-db";
import { gminaLubaczow } from "@/lib/sources/gmina-lubaczow";
import { mzgkim } from "@/lib/sources/mzgkim";
import type { PostSource } from "@/lib/sources/source";
import { handleZukCron, type ZukCronDeps } from "@/lib/zuk-cron";
import { ZUK_PLACES } from "@/lib/zuk-places.generated";
import { readZukFile, writeZukFile } from "@/lib/zuk-store";

// The water cuts of every source into its private Blob file
// (lib/zuk-cron.ts): the gmina's posts (ZUK), then MZGKiM's, each failing
// on its own. Vercel Cron calls it every 15 minutes (vercel.json) with
// `Authorization: Bearer $CRON_SECRET`; by hand:
//
//   curl -H "Authorization: Bearer $CRON_SECRET" https://conaulicy.pl/api/cron/zuk
//
// Outside the Basic Auth gate (proxy.ts matcher): it has its own secret.

// A few model calls of up to 60 s each, every source's within one budget
// (lib/zuk-cron.ts AI_BUDGET_MS, from `since`).
export const maxDuration = 300;

export function GET(request: Request) {
  const since = new Date();
  const run = (source: PostSource): ZukCronDeps => ({
    fetch,
    readFile: () => readZukFile(source.water.pathname),
    writeFile: (body) => writeZukFile(body, source.water.pathname),
    // The file's content changed: its cached copy and every page and
    // calendar tagged WATER, data cache and CDN alike (lib/headers.ts).
    // Never DATASET: the waste data did not change.
    purge: (tag) => revalidateTag(tag, { expire: 0 }),
    // The TERYT snapshot, not the database: the prompt and the gate need
    // each street's CECHA and NAZWA_1 (lib/zuk-resolve.ts). The town's
    // district names (the gazetteer, lib/districts.ts) from the database.
    places: async () => ({ ...ZUK_PLACES, districts: await loadDistricts() }),
    source,
    xaiKey: process.env.XAI_API_KEY,
    now: () => new Date(),
    since,
    log: (line) => console.log(JSON.stringify(line)),
  });
  return handleZukCron(request, process.env.CRON_SECRET, run(gminaLubaczow), [
    run(mzgkim),
  ]);
}
