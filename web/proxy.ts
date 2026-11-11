import {
  type NextFetchEvent,
  type NextRequest,
  NextResponse,
} from "next/server";
import { ADDRESS, type PlacesMap, unknownAddress } from "@/lib/address-routes";
import { cleanQuery } from "@/lib/clean-query";
import { PRIVATE_NO_STORE, TEXT_PLAIN } from "@/lib/headers";
import { NOINDEX_NOFOLLOW } from "@/lib/indexing";
import { movedPath } from "@/lib/places";
import { sameSecret } from "@/lib/secret";

// Pre-launch gate. Active only when SITE_BASIC_AUTH ("user:password") is set.
// On Vercel the proxy runs before the CDN cache, so a cached page is never
// served to a request that has not passed this check.

function authorized(header: string | null, expected: string): boolean {
  if (!header?.startsWith("Basic ")) return false;
  let given: string;
  try {
    given = Buffer.from(header.slice(6), "base64").toString("utf8");
  } catch {
    return false;
  }
  return sameSecret(given, expected);
}

// While gated: never indexed, and never stored by a shared cache. The CDN is
// already safe (see above), but routes send public s-maxage headers, which
// would let a proxy between the visitor and Vercel keep an authorized copy.
const GATED_HEADERS = {
  ...NOINDEX_NOFOLLOW,
  "Cache-Control": PRIVATE_NO_STORE,
};

// The places (/api/places): every id, so an unknown address answers 404
// before any render (lib/address-routes.ts unknownAddress), and the renamed
// ones (old id → new id). A redirect from an address page or a module
// subpage (/adres/<id>/smieci) carries Location twice, as each is a stored
// static result (Cache Components) and Next.js replays the render's headers
// onto the response, so every address's 308 is answered here, with or
// without ?nr=. The PDF redirects itself. The map stays in memory: a cold
// instance fetches it once (from the CDN), later refreshes run after the
// response, so a normal request pays only a lookup. If it cannot be loaded,
// an unknown id is left to the page's own notFound().
const PLACES_TTL = 5 * 60_000;
type Places = {
  ids: ReadonlySet<string> | null;
  moved: Record<string, string>;
  at: number;
};
let places: Places | null = null;
let loading: Promise<void> | null = null;

function loadPlaces(request: NextRequest): Promise<void> {
  const authorization = request.headers.get("authorization");
  loading ??= fetch(new URL("/api/places", request.url), {
    headers: authorization ? { authorization } : {},
  })
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null)
    .then((map: PlacesMap | null) => {
      places = {
        // A renamed place's old id is known too: it redirects.
        ids: Array.isArray(map?.ids)
          ? new Set([...map.ids, ...Object.keys(map.moved ?? {})])
          : null,
        moved: map?.moved ?? {},
        at: Date.now(),
      };
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

async function placesFor(
  request: NextRequest,
  event: NextFetchEvent,
): Promise<Places | null> {
  if (!request.nextUrl.pathname.startsWith("/adres/")) return null;
  if (!places) await loadPlaces(request);
  else if (Date.now() - places.at > PLACES_TTL)
    event.waitUntil(loadPlaces(request));
  return places;
}

function movedAddress(request: NextRequest, known: Places | null): URL | null {
  const { pathname } = request.nextUrl;
  if (!known || !ADDRESS.test(pathname)) return null;
  let id: string;
  try {
    id = decodeURIComponent(pathname.split("/")[2]);
  } catch {
    return null;
  }
  const to = known.moved[id];
  const path = to && movedPath(`${pathname}${request.nextUrl.search}`, id, to);
  return path ? new URL(path, request.url) : null;
}

/**
 * The site's 404 page with its 404 status: a path no route serves
 * (app/not-found.tsx).
 */
function notFoundPage(request: NextRequest, headers?: HeadersInit) {
  return NextResponse.rewrite(new URL("/404", request.url), { headers });
}

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  // Unknown query parameters go to the clean, cached URL (lib/clean-query.ts).
  // Before the gate: a redirect reveals nothing, and both behave the same.
  if (request.method === "GET" || request.method === "HEAD") {
    const search = cleanQuery(
      request.nextUrl.pathname,
      request.nextUrl.searchParams,
    );
    if (search !== null) {
      const url = request.nextUrl.clone();
      url.search = search;
      return NextResponse.redirect(url, 308);
    }
  }

  // Before the gate, as above: the redirect reveals only the new address.
  const known = await placesFor(request, event);
  const renamed = movedAddress(request, known);
  if (renamed) return NextResponse.redirect(renamed, 308);
  // Answered only past the gate: a 404 tells which places exist.
  const unknown = unknownAddress(request.nextUrl.pathname, known?.ids ?? null);

  const expected = process.env.SITE_BASIC_AUTH;
  if (!expected) return unknown ? notFoundPage(request) : NextResponse.next();

  // Open to everyone, so crawlers read the Disallow instead of a 401.
  if (request.nextUrl.pathname === "/robots.txt") {
    return new NextResponse("User-agent: *\nDisallow: /\n", {
      headers: {
        ...GATED_HEADERS,
        ...TEXT_PLAIN,
      },
    });
  }

  if (!authorized(request.headers.get("authorization"), expected)) {
    return new NextResponse("Strona jest jeszcze w przygotowaniu.", {
      status: 401,
      headers: {
        ...GATED_HEADERS,
        "WWW-Authenticate": 'Basic realm="conaulicy", charset="UTF-8"',
        ...TEXT_PLAIN,
      },
    });
  }

  if (unknown) return notFoundPage(request, GATED_HEADERS);
  return NextResponse.next({ headers: GATED_HEADERS });
}

export const config = {
  // Everything except hashed build assets (fonts included), the revalidate
  // hook and the cron routes (each checks its own secret).
  matcher: ["/((?!_next/static/|api/revalidate|api/cron/).*)"],
};
