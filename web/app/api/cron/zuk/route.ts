import { revalidateTag } from "next/cache";
import { getDataset } from "@/lib/dataset";
import { unknownStreets } from "@/lib/districts";
import { LIVE } from "@/lib/headers";
import { runImgw } from "@/lib/imgw-cron";
import { upstream as imgwUpstream } from "@/lib/imgw-warnings";
import { IMGW_KEY, PGE_KEY } from "@/lib/live-status";
import {
  CHECKS_PATH,
  FEED_PATH,
  PGE_PATH,
  readBlobFile,
  writeBlobFile,
} from "@/lib/live-store";
import { runPge } from "@/lib/pge-cron";
import { upstream as pgeUpstream } from "@/lib/pge-feed";
import { gminaLubaczow } from "@/lib/sources/gmina-lubaczow";
import { mzgkim } from "@/lib/sources/mzgkim";
import type { PostSource } from "@/lib/sources/source";
import { handleZukCron, type ZukCronDeps } from "@/lib/zuk-cron";
import { ZUK_PLACES } from "@/lib/zuk-places.generated";
import { readZukFile, writeZukFile } from "@/lib/zuk-store";

// The water cuts of every source into its private Blob file
// (lib/zuk-cron.ts): the gmina's posts (ZUK) and MZGKiM's at the same
// time, each failing on its own; beside them, IMGW's warnings and PGE's
// power outages, each into its own private Blob file (lib/imgw-cron.ts,
// lib/pge-cron.ts: one PGE request a run, 4 an hour of PGE's 60); then every source's check into
// the status file (lib/zuk-cron.ts handleZukCron). After each write the
// LIVE tag is purged (written), so the next request reads the new file:
// the pages hold these files' data in their prerendered HTML, cached as
// "live" (next.config.ts, lib/live-store.ts). Vercel Cron
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

/**
 * A write, then the purge of what the pages cached of the crons' files
 * (LIVE), only once the file is written: expired at once, so the next
 * request reads the new file, as the import's purge of the dataset
 * (app/api/revalidate).
 */
function written<A extends unknown[]>(
  write: (...args: A) => Promise<void>,
): (...args: A) => Promise<void> {
  return async (...args) => {
    await write(...args);
    revalidateTag(LIVE, { expire: 0 });
  };
}

export function GET(request: Request) {
  const deadline = new Date(Date.now() + maxDuration * 1000);
  const run = (source: PostSource): ZukCronDeps => ({
    fetch,
    readFile: () => readZukFile(source.water.pathname),
    writeFile: written((body: string) =>
      writeZukFile(body, source.water.pathname),
    ),
    // The TERYT snapshot, not the database: the prompt and the gate need
    // each street's CECHA and NAZWA_1 (lib/zuk-resolve.ts). The town's
    // district names (the gazetteer, lib/districts.ts) from the dataset
    // snapshot (lib/dataset.ts), never the database.
    // A district street the snapshot lacks is skipped by the gate: logged
    // (ids only), so a stale seed or snapshot shows in the logs.
    places: async () => {
      const { districts } = await getDataset();
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
  const log = (line: Record<string, unknown>) =>
    console.log(JSON.stringify(line));
  // IMGW's feed into imgw/feed.json, PGE's outages into pge/outages.json,
  // each when it changed.
  const imgw = async () =>
    runImgw({
      ...(await imgwUpstream()),
      readFeed: () => readBlobFile(FEED_PATH),
      writeFeed: written((body: string) => writeBlobFile(FEED_PATH, body)),
      log,
    });
  const pge = async () =>
    runPge({
      ...(await pgeUpstream()),
      places: ZUK_PLACES,
      readFile: () => readBlobFile(PGE_PATH),
      writeFile: written((body: string) => writeBlobFile(PGE_PATH, body)),
      log,
    });
  return handleZukCron(
    request,
    process.env.CRON_SECRET,
    run(gminaLubaczow),
    [run(mzgkim)],
    [
      { key: IMGW_KEY, run: imgw },
      { key: PGE_KEY, run: pge },
    ],
    {
      read: () => readBlobFile(CHECKS_PATH),
      write: written((body: string) => writeBlobFile(CHECKS_PATH, body)),
    },
  );
}
