// Response header values sent from more than one place. No imports, so
// next.config.ts can read it too. The prerendered pages and files send
// none of their own: Vercel's cache headers apply.

/** Kept by no cache: the API routes' answers (cron, revalidate). */
export const NO_STORE = { "Cache-Control": "no-store" };

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
