import "server-only";
import { readBlobFile, writeBlobFile } from "./live-store.ts";
import { GMINA } from "./water-sources.ts";

// Each water source's file in the private Blob store (lib/live-store.ts,
// lib/water-sources.ts pathname), written by the cron, which reads its
// origin; the pages read its CDN copy (lib/live-reads.ts).

/**
 * A file's body from the Blob's origin, or null if there is none yet.
 * Throws on other errors.
 */
export function readZukFile(pathname = GMINA.pathname): Promise<string | null> {
  return readBlobFile(pathname);
}

export function writeZukFile(
  body: string,
  pathname = GMINA.pathname,
): Promise<void> {
  return writeBlobFile(pathname, body);
}
