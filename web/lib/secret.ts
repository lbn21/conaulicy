import { createHash, timingSafeEqual } from "node:crypto";
import { NO_STORE } from "./headers.ts";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/**
 * A secret compared in constant time. Hashing first gives equal-length
 * buffers, so the compare time does not depend on where the strings differ
 * or on their lengths.
 */
export function sameSecret(given: string, expected: string): boolean {
  return timingSafeEqual(digest(given), digest(expected));
}

/**
 * A cron route's gate: Vercel Cron's `Authorization: Bearer $CRON_SECRET`.
 * A 401 for anything else, or when no secret is set; null to go on.
 */
export function cronDenied(
  request: Request,
  cronSecret: string | undefined,
): Response | null {
  const given = request.headers.get("authorization") ?? "";
  if (cronSecret && sameSecret(given, `Bearer ${cronSecret}`)) return null;
  return new Response("Unauthorized", { status: 401, headers: NO_STORE });
}

/**
 * A production-only cron's gate (the import, the keep-warm): the cron
 * gate, then a skip outside production, so a preview never acts for it.
 */
export function productionCronDenied(
  request: Request,
  cronSecret: string | undefined,
  vercelEnv: string | undefined,
): Response | null {
  const denied = cronDenied(request, cronSecret);
  if (denied) return denied;
  if (vercelEnv !== "production")
    return Response.json({ skipped: "not production" }, { headers: NO_STORE });
  return null;
}
