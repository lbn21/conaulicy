// Pre-launch Basic Auth gate (see proxy.ts). While it is on, nothing may be
// stored by a shared cache, so routes must not send their public headers.

export function gated(): boolean {
  return Boolean(process.env.SITE_BASIC_AUTH);
}

export function cacheControl(publicValue: string): string {
  return gated() ? "private, no-store" : publicValue;
}
