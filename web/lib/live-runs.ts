import "server-only";
import { parseFeedFile } from "./imgw-warnings.ts";
import { IMGW_KEY, PGE_KEY, waterKey } from "./live-status.ts";
import { FEED_PATH, PGE_PATH } from "./live-store.ts";
import { parseOutagesFile } from "./pge-feed.ts";
import { WATER_SOURCES } from "./water-sources.ts";
import { parseZukFile } from "./zuk-data.ts";

// Each live source's run id (lib/page-refresh.ts), by its key: the time
// its data last changed, as its file has it (IMGW's and PGE's fetchedAt, a
// water file's generatedAt); null: no file, or not one.

/** Each live source's file and how its run id is read from its body. */
const FILES: Array<{
  key: string;
  path: string;
  run: (b: string) => string | null;
}> = [
  {
    key: IMGW_KEY,
    path: FEED_PATH,
    run: (b) => parseFeedFile(b)?.fetchedAt ?? null,
  },
  {
    key: PGE_KEY,
    path: PGE_PATH,
    run: (b) => parseOutagesFile(b)?.fetchedAt ?? null,
  },
  ...WATER_SOURCES.map((source) => ({
    key: waterKey(source.id),
    path: source.pathname,
    run: (b: string) => parseZukFile(b)?.generatedAt ?? null,
  })),
];

/**
 * The run ids of the files whose bodies are known, by path (a body null:
 * no file): what the cron read or wrote this run, no Blob read of its own.
 * A file whose body is unknown (its step failed before reading it) is
 * left out, so it is never compared.
 */
export function runIdsOf(
  bodies: Record<string, string | null>,
): Record<string, string | null> {
  const runs: Record<string, string | null> = {};
  for (const { key, path, run } of FILES)
    if (Object.hasOwn(bodies, path)) {
      const body = bodies[path];
      try {
        runs[key] = body ? run(body) : null;
      } catch {
        runs[key] = null;
      }
    }
  return runs;
}

/** Every live source's file. */
export const RUN_PATHS = FILES.map(({ path }) => path);
