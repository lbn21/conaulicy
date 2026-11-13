import { revalidateTag } from "next/cache";
import { after } from "next/server";
import { SITE_URL } from "@/lib/config.generated";
import { getDataset } from "@/lib/dataset";
import { DEPLOY_MARKER_PATH, syncDataset } from "@/lib/dataset-sync";
import { todayInWarsaw } from "@/lib/dates";
import { unknownStreets } from "@/lib/districts";
import { runImgw } from "@/lib/imgw-cron";
import { upstream as imgwUpstream } from "@/lib/imgw-warnings";
import {
  changedTags,
  laggingTags,
  marksOf,
  REFRESH_RESERVE_S,
  WAIT_MS,
} from "@/lib/live-refresh";
import { runIdsOf } from "@/lib/live-runs";
import { IMGW_KEY, PGE_KEY } from "@/lib/live-status";
import {
  CHECKS_PATH,
  FEED_PATH,
  PGE_PATH,
  readBlobFile,
  writeBlobFile,
} from "@/lib/live-store";
import { SOURCE_TAGS, type SourceTag } from "@/lib/page-cache";
import { runPge } from "@/lib/pge-cron";
import { upstream as pgeUpstream } from "@/lib/pge-feed";
import { prewarm } from "@/lib/prewarm";
import { placeParams } from "@/lib/schedule";
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
// lib/pge-cron.ts: one PGE request a run, 4 an hour of PGE's 60); then every
// source's check into the status file (lib/zuk-cron.ts handleZukCron). A
// file is written only when it changed. The pages are prerendered: a
// changed source's pages are revalidated after the run, and the run starts
// by repairing what the home page shows (lib/live-refresh.ts) and syncing
// the dataset snapshot (lib/dataset-sync.ts). Vercel Cron calls it every
// 15 minutes (vercel.json) with `Authorization: Bearer $CRON_SECRET`; by
// hand:
//
//   curl -H "Authorization: Bearer $CRON_SECRET" https://conaulicy.pl/api/cron/zuk

// Model calls of up to lib/zuk-ai.ts TIMEOUT_MS each, every
// source's within the run's deadline: a call starts only with its timeout
// and a margin left before it (lib/zuk-cron.ts AI_LEFT_MS). The deadline
// leaves REFRESH_RESERVE_S for the wait before the revalidation, which
// runs inside after() and counts against maxDuration.
export const maxDuration = 300;

/** Where this deployment's pages are read: the permanent address in production. */
function siteOrigin(request: Request): string {
  return process.env.VERCEL_ENV === "production"
    ? SITE_URL
    : new URL(request.url).origin;
}

/** Every page a tag's revalidation changes, the home page first. */
async function pagesOf(tags: SourceTag[]): Promise<string[]> {
  const hubs = (await placeParams()).map(({ id }) => `/adres/${id}`);
  return [
    "/",
    ...(tags.includes(SOURCE_TAGS.dataset) ? ["/ulice"] : []),
    ...hubs,
  ];
}

export async function GET(request: Request) {
  const deadline = new Date(
    Date.now() + (maxDuration - REFRESH_RESERVE_S) * 1000,
  );
  const origin = siteOrigin(request);
  const log = (line: Record<string, unknown>) =>
    console.log(JSON.stringify(line));
  const refresh = (tags: SourceTag[], wait: number) => {
    if (tags.length === 0) return;
    after(async () => {
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      for (const tag of tags) revalidateTag(tag, "max");
      log({ refresh: tags, ...(await prewarm(origin, await pagesOf(tags))) });
    });
  };
  // Every live file's body as this run read it, then wrote it: its run id
  // for the check against the home page, with no Blob read of its own.
  const bodies: Record<string, string | null> = {};
  const seen =
    (path: string, read: () => Promise<string | null>) => async () => {
      const body = await read();
      bodies[path] = body;
      return body;
    };
  const kept =
    (path: string, write: (body: string) => Promise<void>) =>
    async (body: string) => {
      await write(body);
      bodies[path] = body;
    };
  const run = (source: PostSource): ZukCronDeps => ({
    fetch,
    readFile: seen(source.water.pathname, () =>
      readZukFile(source.water.pathname),
    ),
    writeFile: kept(source.water.pathname, (body) =>
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
  // IMGW's feed into imgw/feed.json, PGE's outages into pge/outages.json,
  // each when it changed.
  const imgw = async () =>
    runImgw({
      ...(await imgwUpstream()),
      readFeed: seen(FEED_PATH, () => readBlobFile(FEED_PATH)),
      writeFeed: kept(FEED_PATH, (body) => writeBlobFile(FEED_PATH, body)),
      log,
    });
  const pge = async () =>
    runPge({
      ...(await pgeUpstream()),
      places: ZUK_PLACES,
      readFile: seen(PGE_PATH, () => readBlobFile(PGE_PATH)),
      writeFile: kept(PGE_PATH, (body) => writeBlobFile(PGE_PATH, body)),
      log,
    });
  // What the home page shows (its marks), read once the secret is checked.
  let marks: ReturnType<typeof marksOf> = null;
  const start = async () => {
    const home = await fetch(new URL("/", origin))
      .then((r) => (r.ok ? r.text() : ""))
      .catch(() => "");
    marks = marksOf(home);
    if (!marks) log({ refresh: "home-unreadable" });
    try {
      log({
        dataset: await syncDataset(
          {
            fetch,
            hookUrl: process.env.DEPLOY_HOOK_URL,
            revalidate: () => refresh([SOURCE_TAGS.dataset], 0),
            marker: {
              read: () => readBlobFile(DEPLOY_MARKER_PATH),
              write: (body) => writeBlobFile(DEPLOY_MARKER_PATH, body),
            },
            mode: "cron",
            log,
          },
          marks?.dataset,
        ),
      });
    } catch (error) {
      log({ dataset: "sync-error", error: (error as Error).message });
    }
  };
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
      write: (body) => writeBlobFile(CHECKS_PATH, body),
    },
    (sources) => {
      // Changed now: revalidated after the wait. Lagging (the home page
      // rendered with another run id, or another day): at once.
      const changed = changedTags(sources);
      refresh(changed, WAIT_MS);
      refresh(
        laggingTags(marks, runIdsOf(bodies), todayInWarsaw()).filter(
          (tag) => !changed.includes(tag),
        ),
        0,
      );
    },
    start,
  );
}
