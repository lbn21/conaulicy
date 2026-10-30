import { revalidateTag } from "next/cache";
import { unknownStreets } from "@/lib/districts";
import { loadDistricts } from "@/lib/districts-db";
import { runImgw } from "@/lib/imgw-cron";
import { upstream } from "@/lib/imgw-warnings";
import { gminaLubaczow } from "@/lib/sources/gmina-lubaczow";
import { mzgkim } from "@/lib/sources/mzgkim";
import type { PostSource } from "@/lib/sources/source";
import { handleZukCron, type ZukCronDeps } from "@/lib/zuk-cron";
import { ZUK_PLACES } from "@/lib/zuk-places.generated";
import { readZukFile, writeZukFile } from "@/lib/zuk-store";

// The water cuts of every source into its private Blob file
// (lib/zuk-cron.ts): the gmina's posts (ZUK) and MZGKiM's at the same
// time, each failing on its own; beside them, IMGW's warnings, purged from
// the pages after every good fetch (lib/imgw-cron.ts). Vercel Cron
// calls it every 15 minutes (vercel.json) with
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
    // After every run that wrote the file (a new checkedAt at least): its
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
  // After every good fetch of IMGW's feed: the feed's cached copies and
  // every page tagged IMGW (lib/headers.ts), data cache and CDN alike.
  const imgw = async () =>
    runImgw({
      ...(await upstream()),
      purge: (tag) => revalidateTag(tag, { expire: 0 }),
      log: (line) => console.log(JSON.stringify(line)),
    });
  return handleZukCron(
    request,
    process.env.CRON_SECRET,
    run(gminaLubaczow),
    [run(mzgkim)],
    imgw,
  );
}
