// Response header values sent from more than one place. No imports, so
// proxy.ts and next.config.ts can read it too.

/**
 * The one cache tag: Next's data cache, every page shell built from the
 * database (`use cache`, cacheTag) and, sent as Vercel-Cache-Tag
 * (lib/gate.ts datasetHeaders), the CDN copies. Every database read,
 * purged by an import (app/api/revalidate), the only purge: the crons'
 * files (water, IMGW) are read per request through the Blob's CDN, never
 * cached by Next (lib/live-store.ts).
 */
export const DATASET = "dataset";

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
