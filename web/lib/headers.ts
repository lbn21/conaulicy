// Response header values sent from more than one place. No imports, so
// proxy.ts and next.config.ts can read it too.

/** Kept by no cache: answers that must never be reused. */
export const NO_STORE = { "Cache-Control": "no-store" };

/** While the pre-launch gate is on: kept by no shared cache (lib/gate.ts, proxy.ts). */
export const PRIVATE_NO_STORE = "private, no-store";

/** A short plain-text answer: errors, the gated robots.txt. */
export const TEXT_PLAIN = { "Content-Type": "text/plain; charset=utf-8" };

/** As next.config.ts headers() lists them. */
export function headerList(headers: Record<string, string>) {
  return Object.entries(headers).map(([key, value]) => ({ key, value }));
}
