// The only place that decides whether search engines may index the site: a
// production deployment without the pre-launch gate (SITE_BASIC_AUTH, see
// proxy.ts). Preview, local and CI builds are never indexable.
export function indexable(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.VERCEL_ENV === "production" && !env.SITE_BASIC_AUTH;
}

// Files that are never search results (street PDFs, calendars), indexable
// site or not.
export const NOINDEX = { "X-Robots-Tag": "noindex" };

// Every response of a build that is not indexable (next.config.ts), and
// everything while gated (proxy.ts).
export const NOINDEX_NOFOLLOW = { "X-Robots-Tag": "noindex, nofollow" };
