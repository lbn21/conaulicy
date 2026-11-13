import "server-only";
import { parseFeedFile } from "./imgw-warnings.ts";
import { IMGW_KEY, PGE_KEY, waterKey } from "./live-status.ts";
import { FEED_PATH, PGE_PATH, readBlobFile } from "./live-store.ts";
import { parseOutagesFile } from "./pge-feed.ts";
import { WATER_SOURCES } from "./water-sources.ts";
import { parseZukFile } from "./zuk-data.ts";

/**
 * Each live source's run id (lib/live-refresh.ts), by its key: the time
 * its data last changed, as its file has it (IMGW's and PGE's fetchedAt, a
 * water file's generatedAt); null: no file, or unreadable. From the
 * Blob's origin (the cron), or `cdn`, its CDN copy (what a page renders).
 */
export async function liveRuns({
  cdn = false,
}: {
  cdn?: boolean;
} = {}): Promise<Record<string, string | null>> {
  const read = (path: string) => readBlobFile(path, { cdn }).catch(() => null);
  const [imgw, pge, ...water] = await Promise.all([
    read(FEED_PATH),
    read(PGE_PATH),
    ...WATER_SOURCES.map((s) => read(s.pathname)),
  ]);
  const runs: Record<string, string | null> = {
    [IMGW_KEY]: parseFeedFile(imgw)?.fetchedAt ?? null,
    [PGE_KEY]: parseOutagesFile(pge)?.fetchedAt ?? null,
  };
  for (const [i, source] of WATER_SOURCES.entries()) {
    const body = water[i];
    runs[waterKey(source.id)] =
      (body && parseZukFile(body)?.generatedAt) ?? null;
  }
  return runs;
}
