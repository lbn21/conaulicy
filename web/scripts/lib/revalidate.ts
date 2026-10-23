// Refreshes the site's cached pages after a data change: POST /api/revalidate
// (import, revert, redirect). Site: etl/sources.yaml site.url, or SITE_URL
// when set (local runs, check-import). Without REVALIDATE_SECRET it only
// says so: cached pages refresh within an hour. Sends the Vercel protection
// bypass when VERCEL_AUTOMATION_BYPASS_SECRET is set. Throws on a non-OK reply.
import { loadConfig } from "../import/core/config.ts";

/** configured: the caller's site.url when it has loaded the config already. */
export async function revalidate(configured?: string): Promise<void> {
  const site = process.env.SITE_URL || configured || loadConfig().site.url;
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    console.log(
      "Revalidate skipped (no REVALIDATE_SECRET): cached pages refresh within an hour.",
    );
    return;
  }
  const headers: Record<string, string> = { Authorization: `Bearer ${secret}` };
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET)
    headers["x-vercel-protection-bypass"] =
      process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const response = await fetch(new URL("/api/revalidate", site), {
    method: "POST",
    headers,
  });
  if (!response.ok)
    throw new Error(`Revalidate FAILED: HTTP ${response.status}.`);
  console.log(`Revalidate ok: ${await response.text()}`);
}
