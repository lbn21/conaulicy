import "server-only";
import {
  type DatasetBuild,
  datasetBuild,
  latestVersion,
  readVersion,
} from "./dataset.ts";
import { placeSetOf } from "./dataset-views.ts";

// One decision for every publisher of the dataset snapshot: POST
// /api/revalidate (the import, a rollback) and the start of every zuk
// cron run (lib/live-refresh.ts), so a snapshot published while a
// deployment was building is picked up by the first run after it.
// - The same place set as this build's (lib/dataset-views.ts placeSetOf),
//   another version: revalidate the dataset tag ("max": stale served at
//   once, new pages rendered in the background), then pre-warm.
// - Another place set: new pages, lists, sitemap and redirects, which only
//   a build makes: POST the Vercel Deploy Hook (DEPLOY_HOOK_URL), never a
//   revalidation; the pages keep the build's snapshot until the new
//   deployment replaces this one (lib/dataset.ts). Its answer means only
//   "build queued": a failed build is Vercel's failed-build email, and the
//   next publish or cron run sees the same mismatch and calls it again.
// - The hook missing then: an error, so the import fails loudly.

export type SyncAction = "none" | "revalidate" | "deploy";

/**
 * The decision, pure. `build`: this deployment's snapshot (null outside a
 * build's output: every version is its own); `latest`: the pointer's;
 * `served`: the version the pages show now (the home page's, when known):
 * the same as the latest, nothing to do.
 */
export function syncAction(
  build: DatasetBuild | null,
  latest: { version: string; placeSet: string },
  served?: string | null,
): SyncAction {
  if (build && latest.placeSet !== build.placeSet) return "deploy";
  if (served && served === latest.version) return "none";
  return "revalidate";
}

export class MissingDeployHook extends Error {
  constructor() {
    super(
      "Dataset: the place set changed, so a new deployment must build it, and DEPLOY_HOOK_URL is not set.",
    );
  }
}

export type SyncDeps = {
  fetch: typeof fetch;
  /** The Vercel Deploy Hook's URL (env DEPLOY_HOOK_URL). */
  hookUrl: string | undefined;
  /** revalidateTag(dataset, "max"), then the pre-warm. */
  revalidate: () => void;
};

/**
 * Compares the pointer with this deployment and acts (syncAction): the
 * version, the action taken. Throws MissingDeployHook, or on a hook that
 * did not answer 2xx.
 */
export async function syncDataset(
  deps: SyncDeps,
  served?: string | null,
): Promise<{ version: string; action: SyncAction }> {
  const version = await latestVersion();
  const placeSet = placeSetOf(await readVersion(version));
  const action = syncAction(datasetBuild(), { version, placeSet }, served);
  if (action === "revalidate") deps.revalidate();
  if (action === "deploy") {
    if (!deps.hookUrl) throw new MissingDeployHook();
    const response = await deps.fetch(deps.hookUrl, { method: "POST" });
    if (!response.ok)
      throw new Error(
        `Dataset: the deploy hook answered HTTP ${response.status}.`,
      );
  }
  return { version, action };
}
