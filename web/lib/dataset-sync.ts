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
// cron run (lib/page-refresh.ts), so a snapshot published while a
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

export type SyncAction =
  | "none"
  | "revalidate"
  | "deploy"
  | "deploy-pending"
  | "deploy-missing-hook";

/**
 * The deploy request's marker in the private Blob store, read from its
 * origin: the place set a deployment was last asked for, when, and
 * whether the hook was there. A request for the same place set younger
 * than DEPLOY_PENDING_MS is pending: no second POST (a build takes
 * minutes; a failed one is asked for again after it, or by the next
 * publish of another set).
 */
export const DEPLOY_MARKER_PATH = "status/deploy-request.json";
const DEPLOY_PENDING_MS = 6 * 3_600_000;

type DeployMarker = { placeSet: string; at: number; hook: boolean };

function parseMarker(body: string | null): DeployMarker | null {
  if (!body) return null;
  try {
    const { placeSet, at, hook } = JSON.parse(body) as Partial<DeployMarker>;
    return typeof placeSet === "string" &&
      typeof at === "number" &&
      typeof hook === "boolean"
      ? { placeSet, at, hook }
      : null;
  } catch {
    return null;
  }
}

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
  /** DEPLOY_MARKER_PATH's body (the Blob's origin), and its write. */
  marker: {
    read: () => Promise<string | null>;
    write: (body: string) => Promise<void>;
  };
  /**
   * Who asks: "publish" (POST /api/revalidate) throws on a missing hook,
   * so the import fails loudly; "cron" records it in the marker, logs it
   * once per place set and keeps serving the build's snapshot.
   */
  mode: "publish" | "cron";
  log: (line: Record<string, unknown>) => void;
  now?: () => number;
};

/**
 * Compares the pointer with this deployment and acts (syncAction): the
 * version, the action taken. Another place set: the hook, at most once
 * per DEPLOY_PENDING_MS and place set (the marker). Throws
 * MissingDeployHook (publish only), or on a hook that did not answer 2xx
 * (no marker then: the next publish or run asks again).
 */
export async function syncDataset(
  deps: SyncDeps,
  served?: string | null,
): Promise<{ version: string; action: SyncAction }> {
  const version = await latestVersion();
  const placeSet = placeSetOf(await readVersion(version));
  const action = syncAction(datasetBuild(), { version, placeSet }, served);
  if (action === "revalidate") deps.revalidate();
  if (action !== "deploy") return { version, action };
  const now = (deps.now ?? Date.now)();
  if (!deps.hookUrl && deps.mode === "publish") throw new MissingDeployHook();
  const previous = parseMarker(await deps.marker.read().catch(() => null));
  const same = previous?.placeSet === placeSet;
  const fresh = same && now - (previous?.at ?? 0) < DEPLOY_PENDING_MS;
  // A failed write only loses the throttle: logged, the next run asks again.
  const mark = (hook: boolean) =>
    deps.marker
      .write(JSON.stringify({ placeSet, at: now, hook }))
      .catch((error: Error) =>
        deps.log({ dataset: "deploy-marker-unwritten", error: error.message }),
      );
  if (!deps.hookUrl) {
    if (!(same && previous?.hook === false))
      deps.log({
        dataset: "deploy-hook-missing",
        placeSet,
        error: new MissingDeployHook().message,
      });
    if (!(fresh && previous?.hook === false)) await mark(false);
    return { version, action: "deploy-missing-hook" };
  }
  if (fresh && previous?.hook) {
    deps.log({ dataset: "deploy-pending", placeSet, since: previous.at });
    return { version, action: "deploy-pending" };
  }
  const response = await deps.fetch(deps.hookUrl, { method: "POST" });
  if (!response.ok)
    throw new Error(
      `Dataset: the deploy hook answered HTTP ${response.status}.`,
    );
  await mark(true);
  return { version, action: "deploy" };
}
