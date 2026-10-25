import "server-only";
import { get, put } from "@vercel/blob";
import { unstable_cache } from "next/cache";
import {
  parseZukFile,
  ZUK_PATHNAME,
  type ZukData,
  zukView,
} from "./zuk-data.ts";

// The ZUK file in the private Blob store (BLOB_READ_WRITE_TOKEN): read
// through Next's data cache for the pages, fresh for the cron.

/** The file's body, or null if there is none yet. Throws on other errors. */
export async function readZukFile(fresh: boolean): Promise<string | null> {
  const blob = await get(ZUK_PATHNAME, {
    access: "private",
    useCache: !fresh,
  });
  if (blob?.statusCode !== 200) return null;
  return new Response(blob.stream).text();
}

export async function writeZukFile(body: string): Promise<void> {
  await put(ZUK_PATHNAME, body, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
}

const cached = unstable_cache(() => readZukFile(false), ["zuk-file"], {
  revalidate: 600,
});

/**
 * ZUK's water cuts and notices for the pages. No file, or one older than an
 * hour: `stale`, so a page shows the source link instead (lib/zuk-data.ts).
 * @public Pages will read it (no UI yet).
 */
export async function getZukData(now = new Date()): Promise<ZukData> {
  let body: string | null = null;
  try {
    body = await cached();
  } catch (error) {
    console.error(`ZUK file: ${(error as Error).message}`);
  }
  return zukView(body ? parseZukFile(body) : null, now);
}
