// Preview and development only (task 288): ?imgw= on an address page shows
// IMGW warnings from the mock (lib/imgw-mock.ts), so a Preview can be
// reviewed without setting IMGW_WARNINGS_URL. Never in production: there
// the parameter is not even allowed (lib/clean-query.ts), and the mock
// refuses to answer.
//   ?imgw=2            one warning, level 2, in force since an hour ago
//   ?imgw=3,1          two: ours at level 3, one more at level 1
//   ?imgw=1,upcoming   one, level 1, starting at the next 10:00
// Levels 1-3, at most three; `upcoming` or `night` moves the start
// (lib/imgw-mock.ts STARTS).

/** The query parameter. */
export const IMGW_PREVIEW = "imgw";

/** Whether this deployment may read it: anything but production. */
export const imgwPreviewAllowed = (
  env: Record<string, string | undefined> = process.env,
) => env.VERCEL_ENV !== "production";

/** The mock's IMGW_WARNINGS_URL for ?imgw=, or null: none, or not allowed. */
export function imgwPreview(
  value: unknown,
  env: Record<string, string | undefined> = process.env,
): string | null {
  if (!imgwPreviewAllowed(env) || typeof value !== "string") return null;
  const tokens = value.split(",");
  const levels = tokens.filter((t) => /^[123]$/.test(t)).slice(0, 3);
  if (levels.length === 0) return null;
  const query = new URLSearchParams({ level: levels[0] });
  if (levels.length > 1) query.set("also", levels.slice(1).join(","));
  const start = tokens.find((t) => t === "upcoming" || t === "night");
  if (start) query.set("start", start);
  return `mock:1809?${query}`;
}
