import { revalidateTag } from "next/cache";
import { handleZukCron } from "@/lib/zuk-cron";
import { ZUK_PLACES } from "@/lib/zuk-places.generated";
import { readZukFile, writeZukFile } from "@/lib/zuk-store";

// ZUK's water cuts into the private Blob file (lib/zuk-cron.ts). Vercel Cron
// calls it every 15 minutes (vercel.json) with
// `Authorization: Bearer $CRON_SECRET`; by hand:
//
//   curl -H "Authorization: Bearer $CRON_SECRET" https://conaulicy.pl/api/cron/zuk
//
// Outside the Basic Auth gate (proxy.ts matcher): it has its own secret.

// A few model calls of up to 60 s each (lib/zuk-cron.ts AI_BUDGET_MS).
export const maxDuration = 300;

export function GET(request: Request) {
  return handleZukCron(request, process.env.CRON_SECRET, {
    fetch,
    readFile: readZukFile,
    writeFile: writeZukFile,
    // The file's content changed: its cached copy and every page and
    // calendar tagged WATER, data cache and CDN alike (lib/headers.ts).
    // Never DATASET: the waste data did not change.
    purge: (tag) => revalidateTag(tag, { expire: 0 }),
    // The TERYT snapshot, not the database: the prompt and the gate need
    // each street's CECHA and NAZWA_1 (lib/zuk-resolve.ts).
    places: async () => ZUK_PLACES,
    xaiKey: process.env.XAI_API_KEY,
    now: () => new Date(),
    log: (line) => console.log(JSON.stringify(line)),
  });
}
