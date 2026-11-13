// Tells the site a new dataset snapshot is published: POST /api/revalidate
// (import, revert, publish, rollback), which decides (web/lib/dataset-sync.ts):
// the same place set, the pages revalidated; another, a new deployment
// through the Deploy Hook. Site: etl/sources.yaml site.url, or SITE_URL
// when set (local runs, check-import). It first waits WAIT_MS after the
// pointer moved in the Blob store, as the site reads it through the Blob's
// CDN (at most 60 s behind a write); a directory store (DATASET_DIR, the
// checks) has no CDN to wait for. Without REVALIDATE_SECRET it only says
// so. Sends the Vercel protection bypass when
// VERCEL_AUTOMATION_BYPASS_SECRET is set. Throws on a non-OK reply: the
// place set changed and DEPLOY_HOOK_URL is not set, or the hook failed.
import { loadConfig } from "../import/core/config.ts";

/** The Blob CDN's 60 s and a margin (web/lib/live-refresh.ts WAIT_MS). */
const WAIT_MS = 65_000;

/** What the site did: revalidated, deployed, nothing, or not asked. */
export type RevalidateAction = "revalidate" | "deploy" | "none" | "skipped";

/** configured: the caller's site.url when it has loaded the config already. */
export async function revalidate(
  configured?: string,
): Promise<RevalidateAction> {
  const site = process.env.SITE_URL || configured || loadConfig().site.url;
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    console.log(
      "Revalidate skipped (no REVALIDATE_SECRET): the site keeps its pages until the next revalidation or deploy.",
    );
    return "skipped";
  }
  if (!process.env.DATASET_DIR) {
    console.log(
      `Waiting ${WAIT_MS / 1000} s for the Blob CDN before revalidating…`,
    );
    await new Promise((resolve) => setTimeout(resolve, WAIT_MS));
  }
  const headers: Record<string, string> = { Authorization: `Bearer ${secret}` };
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET)
    headers["x-vercel-protection-bypass"] =
      process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const response = await fetch(new URL("/api/revalidate", site), {
    method: "POST",
    headers,
  });
  const body = await response.text();
  if (!response.ok)
    throw new Error(`Revalidate FAILED: HTTP ${response.status}. ${body}`);
  console.log(`Revalidate ok: ${body}`);
  const { action } = JSON.parse(body) as { action: RevalidateAction };
  return action;
}
