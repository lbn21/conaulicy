// Response header values sent from more than one place. No imports, so
// proxy.ts and next.config.ts can read it too.

/**
 * The dataset's cache tag: Next's data cache, every page and read built
 * from the dataset snapshot (`use cache`, cacheTag) and, sent as
 * Vercel-Cache-Tag (lib/gate.ts datasetHeaders), the CDN copies. Purged by
 * an import (app/api/revalidate).
 */
export const DATASET = "dataset";

/**
 * The live data's cache tag (cacheLife "live", next.config.ts): every read
 * of the crons' files (lib/live-store.ts, lib/zuk-store.ts) and every
 * page's data that counts from today. Purged by the cron after each write
 * (app/api/cron/zuk).
 */
export const LIVE = "live";

/** Kept by no cache: answers that must never be reused. */
export const NO_STORE = { "Cache-Control": "no-store" };

/** While the pre-launch gate is on: kept by no shared cache (lib/gate.ts, proxy.ts). */
export const PRIVATE_NO_STORE = "private, no-store";

/** A short plain-text answer: errors, the gated robots.txt. */
export const TEXT_PLAIN = { "Content-Type": "text/plain; charset=utf-8" };

/**
 * On every response (next.config.ts headers()): no MIME sniffing, the
 * origin only to other sites, never in a frame, no powerful features. Only
 * frame-ancestors of a CSP: script-src and the rest would need Next.js's
 * inline scripts and Vercel Web Analytics allowed by hand.
 */
export const SECURITY = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Content-Security-Policy": "frame-ancestors 'none'",
};

/** As next.config.ts headers() lists them. */
export function headerList(headers: Record<string, string>) {
  return Object.entries(headers).map(([key, value]) => ({ key, value }));
}
