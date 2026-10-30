import { revalidateTag } from "next/cache";
import { unknownStreets } from "@/lib/districts";
import { loadDistricts } from "@/lib/districts-db";
import { gminaLubaczow } from "@/lib/sources/gmina-lubaczow";
import { mzgkim } from "@/lib/sources/mzgkim";
import type { PostSource } from "@/lib/sources/source";
import { handleZukCron, type ZukCronDeps } from "@/lib/zuk-cron";
import { ZUK_PLACES } from "@/lib/zuk-places.generated";
import { readZukFile, writeZukFile } from "@/lib/zuk-store";

// The water cuts of every source into its private Blob file
// (lib/zuk-cron.ts): the gmina's posts (ZUK) and MZGKiM's at the same
// time, each failing on its own. Vercel Cron calls it every 15 minutes (vercel.json) with
// `Authorization: Bearer $CRON_SECRET`; by hand:
//
//   curl -H "Authorization: Bearer $CRON_SECRET" https://conaulicy.pl/api/cron/zuk
//
// Outside the Basic Auth gate (proxy.ts matcher): it has its own secret.

// Model calls of up to lib/zuk-ai.ts TIMEOUT_MS each, every
// source's within this one limit: a call starts only with its timeout
// and a margin left before the deadline (lib/zuk-cron.ts AI_LEFT_MS).
export const maxDuration = 300;

export function GET(request: Request) {
  const deadline = new Date(Date.now() + maxDuration * 1000);
  const run = (source: PostSource): ZukCronDeps => ({
    fetch,
    readFile: () => readZukFile(source.water.pathname),
    writeFile: (body) => writeZukFile(body, source.water.pathname),
    // The file's content changed, or time moved what the pages show (a
    // Warsaw midnight, a cut's end; lib/zuk-data.ts movedSince): its
    // cached copy and every page and calendar tagged WATER; after a Warsaw
    // midnight also DAY, the day-keyed waste data and every response built
    // from it (lib/zuk-data.ts dayChanged). Data cache and CDN alike
    // (lib/headers.ts). Never DATASET: the waste data did not change.
    purge: (tag) => revalidateTag(tag, { expire: 0 }),
    // The TERYT snapshot, not the database: the prompt and the gate need
    // each street's CECHA and NAZWA_1 (lib/zuk-resolve.ts). The town's
    // district names (the gazetteer, lib/districts.ts) from the database.
    // A district street the snapshot lacks is skipped by the gate: logged
    // (ids only), so a stale seed or snapshot shows in the logs.
    places: async () => {
      const districts = await loadDistricts();
      for (const u of unknownStreets(districts, ZUK_PLACES.streets))
        console.log(JSON.stringify({ zuk: "district-street-unknown", ...u }));
      return { ...ZUK_PLACES, districts };
    },
    source,
    xaiKey: process.env.XAI_API_KEY,
    now: () => new Date(),
    deadline,
    log: (line) => console.log(JSON.stringify(line)),
  });
  return handleZukCron(request, process.env.CRON_SECRET, run(gminaLubaczow), [
    run(mzgkim),
  ]);
}
