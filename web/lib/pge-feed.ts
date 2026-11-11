// PGE Dystrybucja's power outages (PowerOutage API 1.0.1): fetch, parse,
// keep our area's, and the last good copy's file (pge/outages.json,
// written by lib/pge-cron.ts, read by the pages through lib/live-store.ts).
// Format, area, times, limits and terms: docs/data/pge.md. No Next.js
// imports, so the unit tests run it as is.
import { isoWithOffset, warsawToIso } from "./dates.ts";
import { FetchFailure } from "./live-cron.ts";
import type { ZukPlaces } from "./zuk-resolve.ts";

/** The API's base URL (PGE_API_URL overrides it outside production). */
export const PGE_URL = "https://power-outage.gkpge.pl";

/** PGE's region for our gminas: RE Tomaszów Lubelski. */
const PGE_REGION = "49";

/** The list endpoint for our region: one request per cron run. */
export const outagesUrl = (base: string) =>
  `${base.replace(/\/+$/, "")}/api/power-outage?regionIdentifier=${PGE_REGION}`;

/** PGE's own API limit is 60 requests an hour; one request per run. */
const TIMEOUT_MS = 10_000;

/** The file's shape: raise it when it changes (an older file is rewritten). */
const FILE_VERSION = 1;

/** One address of an outage: TERYT codes, PGE's house numbers verbatim. */
type PgeAddress = {
  /** SIMC, 7 digits. */
  simc: string;
  /** ULIC, 5 digits; null when PGE names no street. */
  ulic: string | null;
  /** PGE's list as given ("1, 3/1, DZ 17/18"); null when it gives none. */
  numbers: string | null;
};

export type PgeOutage = {
  uuid: string;
  /** type 2: planned work; type 1: a failure. */
  kind: "planned" | "failure";
  revoked: boolean;
  revokedNote: string | null;
  /** ISO with offset, Warsaw: when the power is off, soonest first. */
  ranges: Array<{ start: string; end: string }>;
  addresses: PgeAddress[];
  /** ISO: PGE's last change (updatedAt, else createdAt); null if neither. */
  updatedAt: string | null;
};

export type PgeFeed = { fetchedAt: string; items: PgeOutage[] };

type Raw = Record<string, unknown>;
type Log = (line: Record<string, unknown>) => void;

const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const KINDS: Record<number, PgeOutage["kind"]> = { 1: "failure", 2: "planned" };

/** A range's two wall times as ISO; null if either is not one or it is empty. */
function range(startAt: unknown, stopAt: unknown) {
  const start = warsawToIso(String(startAt), "earlier");
  const end = warsawToIso(String(stopAt), "later");
  if (!start || !end || Date.parse(end) <= Date.parse(start)) return null;
  return { start, end };
}

function address(raw: unknown): PgeAddress | null {
  const teryt = (raw as Raw | null)?.teryt as Raw | undefined;
  const simc = teryt?.citySym;
  const ulic = teryt?.streetSymUl ?? null;
  if (typeof simc !== "string" || !/^\d{7}$/.test(simc)) return null;
  if (ulic !== null && (typeof ulic !== "string" || !/^\d{5}$/.test(ulic)))
    return null;
  return { simc, ulic, numbers: text((raw as Raw).numbers) };
}

function parseItem(raw: Raw, log: Log): PgeOutage | string {
  const uuid = text(raw.uuid);
  if (!uuid) return "no uuid";
  const kind = KINDS[Number(raw.type)];
  if (!kind) return `${uuid}: type ${JSON.stringify(raw.type)}`;
  // dateRanges: when the power is really off. Undocumented, so without it
  // the whole startAt-stopAt (longer, the safe side), logged.
  let given = Array.isArray(raw.dateRanges) ? (raw.dateRanges as Raw[]) : [];
  if (given.length === 0) {
    log({ pge: "no-date-ranges", uuid });
    given = [{ startAt: raw.startAt, stopAt: raw.stopAt }];
  }
  const ranges = given.map((r) => range(r?.startAt, r?.stopAt));
  if (ranges.some((r) => !r)) return `${uuid}: time`;
  const addresses = Array.isArray(raw.addresses)
    ? raw.addresses.map(address)
    : [];
  if (addresses.length === 0 || addresses.some((a) => !a))
    return `${uuid}: addresses`;
  const changed = text(raw.updatedAt) ?? text(raw.createdAt);
  return {
    uuid,
    kind,
    revoked: raw.revoked === true,
    revokedNote: text(raw.revokedDescription),
    ranges: (ranges as PgeOutage["ranges"]).sort(
      (a, b) => Date.parse(a.start) - Date.parse(b.start),
    ),
    addresses: addresses as PgeAddress[],
    updatedAt: changed ? warsawToIso(changed) : null,
  };
}

/**
 * The list's outages. Anything but a list throws (an error object, HTML
 * fails before, as JSON); a malformed item is skipped and logged.
 */
export function parseOutages(body: unknown, log: Log): PgeOutage[] {
  if (!Array.isArray(body)) throw new Error("PGE: not a list");
  const items: PgeOutage[] = [];
  for (const raw of body) {
    const item =
      raw && typeof raw === "object"
        ? parseItem(raw as Raw, log)
        : "not an object";
    if (typeof item === "string") log({ pge: "skipped", reason: item });
    else items.push(item);
  }
  return items;
}

/**
 * Only our addresses (the localities and streets TERYT has for our gminas,
 * lib/zuk-places.generated.ts), and only the outages with one. A street our
 * snapshot lacks is dropped and logged (codes only), so a stale snapshot
 * shows in the logs. Soonest first, then by uuid: the file's order.
 */
export function ours(
  items: PgeOutage[],
  places: Pick<ZukPlaces, "localities" | "streets">,
  log: Log,
): PgeOutage[] {
  const localities = new Set(places.localities.map((l) => l.id));
  const streets = new Set(places.streets.map((s) => s.id));
  const kept: PgeOutage[] = [];
  for (const item of items) {
    const addresses = item.addresses.filter((a) => {
      if (!localities.has(a.simc)) return false;
      if (a.ulic === null || streets.has(`${a.simc}-${a.ulic}`)) return true;
      log({
        pge: "street-unknown",
        uuid: item.uuid,
        simc: a.simc,
        ulic: a.ulic,
      });
      return false;
    });
    if (addresses.length > 0) kept.push({ ...item, addresses });
  }
  return kept.sort(
    (a, b) =>
      Date.parse(a.ranges[0].start) - Date.parse(b.ranges[0].start) ||
      a.uuid.localeCompare(b.uuid),
  );
}

/**
 * GET the list. Throws FetchFailure("auth-error") with no token (nothing
 * sent) or on 401/403, ("rate-limited") on 429; any other HTTP error, a
 * timeout or a body that is not the list throws too. The token goes only
 * in its header: never in a message.
 */
export async function fetchOutages(
  url: string,
  {
    fetch: get,
    token,
    log,
    timeoutMs = TIMEOUT_MS,
    now = () => Date.now(),
  }: {
    fetch: typeof fetch;
    token: string | undefined;
    log: Log;
    timeoutMs?: number;
    now?: () => number;
  },
): Promise<PgeFeed> {
  if (!token) throw new FetchFailure("auth-error", "PGE: no token");
  const response = await get(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Accept: "application/json", "X-Auth-Token": token },
    cache: "no-store",
  });
  const status = `PGE: HTTP ${response.status}`;
  if (response.status === 401 || response.status === 403)
    throw new FetchFailure("auth-error", status);
  if (response.status === 429) throw new FetchFailure("rate-limited", status);
  if (!response.ok) throw new Error(status);
  const items = parseOutages(JSON.parse(await response.text()), log);
  return { fetchedAt: isoWithOffset(now()), items };
}

/**
 * Where the list comes from: PGE_API_URL (a base URL), else the official
 * one; the token is PGE_API_TOKEN. "mock:…" serves the fixtures
 * (lib/pge-mock.ts, docs/data/pge.md) and is refused in production, which
 * then uses the official URL.
 */
export async function upstream(
  env: Record<string, string | undefined> = process.env,
): Promise<{ url: string; fetch: typeof fetch; token: string | undefined }> {
  const token = env.PGE_API_TOKEN?.trim() || undefined;
  const base = env.PGE_API_URL?.trim() || PGE_URL;
  if (!base.startsWith("mock:")) return { url: outagesUrl(base), fetch, token };
  if (env.VERCEL_ENV === "production") {
    console.warn("PGE_API_URL: the mock is off in production");
    return { url: outagesUrl(PGE_URL), fetch, token };
  }
  const { mockFetch } = await import("./pge-mock.ts");
  return { url: base, fetch: mockFetch, token };
}

/** The file's body: the copy as fetched, with its version. */
export function outagesFile(feed: PgeFeed): string {
  return JSON.stringify({ version: FILE_VERSION, ...feed });
}

/**
 * The file's copy, or null when there is no file yet. Throws on a body
 * that is not the file (not JSON, another version, another shape).
 */
export function parseOutagesFile(body: string | null): PgeFeed | null {
  if (body === null) return null;
  const file = JSON.parse(body) as Record<string, unknown> | null;
  if (
    file?.version !== FILE_VERSION ||
    typeof file.fetchedAt !== "string" ||
    Number.isNaN(Date.parse(file.fetchedAt)) ||
    !Array.isArray(file.items)
  )
    throw new Error(`PGE outages file: not version ${FILE_VERSION}`);
  return { fetchedAt: file.fetchedAt, items: file.items as PgeOutage[] };
}
