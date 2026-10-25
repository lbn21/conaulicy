// The daily import trigger (app/api/cron/import/route.ts): Vercel Cron only
// starts .github/workflows/import.yml with mode=apply; the import itself runs
// on GitHub (docs/import.md). Production only, so a preview never starts a
// production import. One try: a failed dispatch waits for tomorrow's run.
// Dependencies come in, so the tests mock them.

import { NO_STORE } from "./headers.ts";
import { cronDenied } from "./secret.ts";

export const DISPATCH_URL =
  "https://api.github.com/repos/lbn21/conaulicy/actions/workflows/import.yml/dispatches";

export type ImportCronDeps = {
  fetch: typeof fetch;
  /** VERCEL_ENV: "production", "preview" or "development". */
  vercelEnv: string | undefined;
  /** A GitHub token that may dispatch import.yml; never logged. */
  token: string | undefined;
  log: (line: Record<string, unknown>) => void;
};

export async function handleImportCron(
  request: Request,
  cronSecret: string | undefined,
  deps: ImportCronDeps,
): Promise<Response> {
  const denied = cronDenied(request, cronSecret);
  if (denied) return denied;
  if (deps.vercelEnv !== "production")
    return Response.json({ skipped: "not production" }, { headers: NO_STORE });
  if (!deps.token) {
    deps.log({ import: "error", error: "IMPORT_DISPATCH_TOKEN is not set" });
    return Response.json(
      { error: "not configured" },
      { status: 500, headers: NO_STORE },
    );
  }
  const response = await deps.fetch(DISPATCH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${deps.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main", inputs: { mode: "apply" } }),
  });
  if (response.status !== 204) {
    deps.log({
      import: "dispatch-failed",
      status: response.status,
      body: await response.text(),
    });
    return Response.json(
      { error: "dispatch failed" },
      { status: 502, headers: NO_STORE },
    );
  }
  deps.log({ import: "dispatched" });
  return Response.json({ dispatched: true }, { headers: NO_STORE });
}
