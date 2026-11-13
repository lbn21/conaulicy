// How often the zuk cron (app/api/cron/zuk/route.ts) checks each kind of
// source: one Vercel Cron entry each in vercel.json (lib/cadence.test.ts
// keeps the two one). IMGW's warnings and PGE's outages every 15 minutes;
// the water sources' posts every 4 hours, at minute 0, between two live
// runs (7, 22, 37, 52), so no two runs ever overlap (maxDuration 5 min)
// and the cron stays the one writer of its status and digest files.

export const CADENCES = {
  live: {
    path: "/api/cron/zuk",
    schedule: "7,22,37,52 * * * *",
    every: "15 minut",
  },
  water: {
    path: "/api/cron/zuk?sources=water",
    schedule: "0 */4 * * *",
    every: "4 godziny",
  },
} as const;

export type Cadence = keyof typeof CADENCES;

/** A cron call's cadence, by its URL's `sources` (CADENCES' paths). */
export const cadenceOf = (url: string): Cadence =>
  new URL(url).searchParams.get("sources") === "water" ? "water" : "live";
