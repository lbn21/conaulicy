import { DATASET } from "@/lib/schedule";

// Pre-launch Basic Auth gate (see proxy.ts). While it is on, nothing may be
// stored by a shared cache, so routes must not send their public headers.

function gated(): boolean {
  return Boolean(process.env.SITE_BASIC_AUTH);
}

export function cacheControl(publicValue: string): string {
  return gated() ? "private, no-store" : publicValue;
}

/**
 * Headers of a response built from the dataset: cached by the CDN (unless
 * gated) and tagged, so an import's POST /api/revalidate deletes the CDN copy
 * too. A function, as the gate is read per request.
 */
export function datasetHeaders(
  publicValue = "public, s-maxage=3600, stale-while-revalidate=86400",
): Record<string, string> {
  return {
    "Cache-Control": cacheControl(publicValue),
    "Vercel-Cache-Tag": DATASET,
  };
}
