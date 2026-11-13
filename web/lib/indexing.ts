// The only place that decides whether search engines may index the site: a
// production deployment. Preview, local and CI builds are never indexable
// (previews are behind Vercel's Deployment Protection).
export function indexable(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.VERCEL_ENV === "production";
}

// Files that are never search results (street PDFs, calendars), indexable
// site or not.
export const NOINDEX = { "X-Robots-Tag": "noindex" };

// Every response of a build that is not indexable (next.config.ts).
export const NOINDEX_NOFOLLOW = { "X-Robots-Tag": "noindex, nofollow" };
