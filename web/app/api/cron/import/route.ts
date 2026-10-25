import { handleImportCron } from "@/lib/import-cron";

// Starts the daily import (lib/import-cron.ts): Vercel Cron calls it once a
// day (vercel.json) with `Authorization: Bearer $CRON_SECRET`; by hand:
//
//   curl -H "Authorization: Bearer $CRON_SECRET" https://conaulicy.pl/api/cron/import
//
// Outside the Basic Auth gate (proxy.ts matcher): it has its own secret.

export function GET(request: Request) {
  return handleImportCron(request, process.env.CRON_SECRET, {
    fetch,
    vercelEnv: process.env.VERCEL_ENV,
    token: process.env.IMPORT_DISPATCH_TOKEN,
    log: (line) => console.log(JSON.stringify(line)),
  });
}
