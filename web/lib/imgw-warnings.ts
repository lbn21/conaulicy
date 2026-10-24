// IMGW meteo warnings for a powiat: fetch, parse and the last good copy.
// Format, area coding, times and terms: docs/data/imgw.md. No Next.js
// imports, so the unit tests run it as is; components/imgw-banner.tsx adds
// the data cache.
import { GMINA_SCHEDULE_PAGES } from "./config.generated.ts";
import { isoWithOffset, warsawToIso } from "./dates.ts";

/** The official endpoint (danepubliczne.imgw.pl, IMGW-PIB's public API). */
export const IMGW_URL = "https://danepubliczne.imgw.pl/api/data/warningsmeteo";

const TIMEOUT_MS = 5000;

/** A fresh copy is fetched at most once per this many seconds. */
export const REFRESH_SECONDS = 600;

/** How many earlier copies a failed fetch may fall back to: three hours. */
const KEEP = 18;

/** How long the data cache keeps each copy (the current one and KEEP more). */
export const KEEP_SECONDS = (KEEP + 1) * REFRESH_SECONDS;

type Level = 1 | 2 | 3;

export type Warning = {
  id: string;
  event: string;
  level: Level;
  /** Percent, as IMGW gives it. */
  probability: number;
  validFrom: string;
  validTo: string;
  text: string;
  office: string;
  published: string;
};

/** One parsed warning and the powiats (4-digit TERYT) it covers. */
type FeedItem = Warning & { teryt: string[] };

export type Feed = { fetchedAt: string; items: FeedItem[] };

/** The powiats our gminas lie in: the first 4 digits of their TERYT. */
export const POWIATS = new Set(
  Object.keys(GMINA_SCHEDULE_PAGES).map((teryt) => teryt.slice(0, 4)),
);

type Raw = Record<string, unknown>;

const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

function parseItem(raw: Raw): FeedItem | string {
  const id = text(raw.id);
  if (!id) return "no id";
  const level = Number(raw.stopien);
  if (level !== 1 && level !== 2 && level !== 3)
    return `${id}: level ${JSON.stringify(raw.stopien)}`;
  const probability = Number(text(raw.prawdopodobienstwo));
  if (!Number.isInteger(probability) || probability < 0 || probability > 100)
    return `${id}: probability ${JSON.stringify(raw.prawdopodobienstwo)}`;
  const validFrom = warsawToIso(String(raw.obowiazuje_od), "earlier");
  const validTo = warsawToIso(String(raw.obowiazuje_do), "later");
  const published = warsawToIso(String(raw.opublikowano));
  if (!validFrom || !validTo || !published) return `${id}: time`;
  const teryt = raw.teryt;
  if (
    !Array.isArray(teryt) ||
    !teryt.every((code) => typeof code === "string" && /^\d{4}$/.test(code))
  )
    return `${id}: teryt`;
  const event = text(raw.nazwa_zdarzenia);
  const body = text(raw.tresc);
  const office = text(raw.biuro);
  if (!event || !body || !office) return `${id}: missing text`;
  return {
    id,
    event,
    level,
    probability,
    validFrom,
    validTo,
    text: body,
    office,
    published,
    teryt,
  };
}

/**
 * The feed's warnings. A list, or {"message": "Brak ostrzeżeń…"} when there
 * are none; any other shape throws. A malformed item is skipped and logged.
 */
export function parseFeed(
  body: unknown,
  log: (message: string) => void = console.warn,
): FeedItem[] {
  if (!Array.isArray(body)) {
    if (body && typeof body === "object" && "message" in body) return [];
    throw new Error("IMGW warnings: neither a list nor a message");
  }
  const items: FeedItem[] = [];
  for (const raw of body) {
    const item =
      raw && typeof raw === "object" ? parseItem(raw as Raw) : "not an object";
    if (typeof item === "string") log(`IMGW warnings: skipped (${item})`);
    else items.push(item);
  }
  return items;
}

/** GET the feed; throws on a timeout, an HTTP error or a body that is not the feed. */
export async function fetchFeed(
  url: string,
  {
    fetch: get = fetch,
    timeoutMs = TIMEOUT_MS,
    now = () => Date.now(),
  }: { fetch?: typeof fetch; timeoutMs?: number; now?: () => number } = {},
): Promise<Feed> {
  const response = await get(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`IMGW warnings: HTTP ${response.status}`);
  const items = parseFeed(JSON.parse(await response.text()));
  return { fetchedAt: isoWithOffset(now()), items };
}

/** A powiat's warnings in force or to come: highest level first, then soonest. */
export function forPowiat(
  items: FeedItem[],
  powiat: string,
  now: number,
): Warning[] {
  return items
    .filter(
      (item) => item.teryt.includes(powiat) && Date.parse(item.validTo) > now,
    )
    .sort(
      (a, b) =>
        b.level - a.level || Date.parse(a.validFrom) - Date.parse(b.validFrom),
    )
    .map(({ teryt: _, ...warning }) => warning);
}

/**
 * Where the feed comes from: IMGW_WARNINGS_URL, else the official endpoint.
 * "mock:…" serves the fixtures (lib/imgw-mock.ts, docs/data/imgw.md) and is
 * refused in production, which then uses the official endpoint.
 */
export async function upstream(
  env: Record<string, string | undefined> = process.env,
): Promise<{ url: string; fetch: typeof fetch }> {
  const url = env.IMGW_WARNINGS_URL?.trim() || IMGW_URL;
  if (!url.startsWith("mock:")) return { url, fetch };
  if (env.VERCEL_ENV === "production") {
    console.warn("IMGW_WARNINGS_URL: the mock is off in production");
    return { url: IMGW_URL, fetch };
  }
  const { mockFetch } = await import("./imgw-mock.ts");
  return { url, fetch: mockFetch };
}

/**
 * The current copy (slot = REFRESH_SECONDS), or if it cannot be fetched the
 * newest copy kept from the last three hours (stale), or null. `read` returns the
 * slot's cached copy or calls `load` to make it, and throws if that throws.
 */
export async function latest(
  now: number,
  read: (slot: number, load: () => Promise<Feed>) => Promise<Feed>,
  load: () => Promise<Feed>,
): Promise<{ feed: Feed; stale: boolean } | null> {
  const slot = Math.floor(now / (REFRESH_SECONDS * 1000));
  try {
    return { feed: await read(slot, load), stale: false };
  } catch (error) {
    console.warn(`IMGW warnings: fetch failed (${(error as Error).message})`);
  }
  const none = () => Promise.reject(new Error("no copy"));
  const kept = await Promise.all(
    Array.from({ length: KEEP }, (_, i) =>
      read(slot - 1 - i, none).catch(() => null),
    ),
  );
  const feed = kept.find((copy) => copy !== null);
  return feed ? { feed, stale: true } : null;
}
