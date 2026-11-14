import { handleKeepWarmCron, keepWarmPaths } from "@/lib/keepwarm";
import { prewarm, siteOrigin, warmUntil } from "@/lib/prewarm";

// The daily keep-warm (lib/keepwarm.ts): Vercel Cron calls it once a day
// (vercel.json) with `Authorization: Bearer $CRON_SECRET`; one GET for each
// path of the day's slice, so no prerendered page or file goes 31 days
// unread. Production only. By hand:
//
//   curl -H "Authorization: Bearer $CRON_SECRET" https://conaulicy.pl/api/cron/keepwarm

// The slice's GETs end by the function's end, less the log's margin.
export const maxDuration = 300;

export function GET(request: Request) {
  const until = warmUntil(Date.now(), maxDuration);
  const origin = siteOrigin(request);
  return handleKeepWarmCron(request, process.env.CRON_SECRET, {
    vercelEnv: process.env.VERCEL_ENV,
    paths: keepWarmPaths,
    prewarm: (paths) => prewarm(origin, paths, { until, since: null }),
    now: Date.now,
    log: (line) => console.log(JSON.stringify(line)),
  });
}
