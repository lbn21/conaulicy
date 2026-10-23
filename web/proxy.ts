import {
  type NextFetchEvent,
  type NextRequest,
  NextResponse,
} from "next/server";
import { cleanQuery } from "@/lib/clean-query";
import { NR_QUERY } from "@/lib/house";
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
  "X-Robots-Tag": "noindex, nofollow",
  "Cache-Control": "private, no-store",
};

const ADDRESS = /^\/adres\/([^/]+)\/?$/;
const NR = new RegExp(`^${NR_QUERY}$`);

// A street page asked with ?nr= but no usable house number (empty, or not a
// number) goes to its own cached page, which shows the GOV.UK error on a
// split street. Valid numbers are rewritten in next.config.ts; a rewrite's
// `has` cannot match an empty value, hence here.
function missingNumber(request: NextRequest): URL | null {
  const match = ADDRESS.exec(request.nextUrl.pathname);
  const nr = request.nextUrl.searchParams.get("nr");
  if (!match || nr === null || NR.test(nr)) return null;
  const url = request.nextUrl.clone();
  url.pathname = `/adres/${match[1]}/numer`;
  url.search = "";
  return url;
}

// Renamed places (old id → new id, /api/place-redirects). An address with
// ?nr= is rewritten to another page (next.config.ts, missingNumber), and a
// redirect from a rewritten page carries Location twice (Next.js replays the
// render's headers onto the response), so its 308 is answered here, before
// the rewrite. The plain page and the PDF redirect themselves. The map stays
// in memory: a cold instance fetches it once (from the CDN), later
// refreshes run after the response, so a normal request pays only a lookup.
const MOVED_TTL = 5 * 60_000;
let moved: { map: Record<string, string>; at: number } | null = null;
let loading: Promise<void> | null = null;

function loadMoved(request: NextRequest): Promise<void> {
  const authorization = request.headers.get("authorization");
  loading ??= fetch(new URL("/api/place-redirects", request.url), {
    headers: authorization ? { authorization } : {},
  })
    .then((res) => (res.ok ? res.json() : {}))
    .catch(() => ({}))
    .then((map: Record<string, string>) => {
      moved = { map, at: Date.now() };
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

async function movedAddress(
  request: NextRequest,
  event: NextFetchEvent,
): Promise<URL | null> {
  const match = ADDRESS.exec(request.nextUrl.pathname);
  if (!match || !request.nextUrl.searchParams.has("nr")) return null;
  if (!moved) await loadMoved(request);
  else if (Date.now() - moved.at > MOVED_TTL)
    event.waitUntil(loadMoved(request));
  let id: string;
  try {
    id = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  const to = moved?.map[id];
  const path =
    to &&
    movedPath(`${request.nextUrl.pathname}${request.nextUrl.search}`, id, to);
  return path ? new URL(path, request.url) : null;
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
  const renamed = await movedAddress(request, event);
  if (renamed) return NextResponse.redirect(renamed, 308);

  const rewrite = missingNumber(request);
  const pass = (headers?: Record<string, string>) =>
    rewrite
      ? NextResponse.rewrite(rewrite, { headers })
      : NextResponse.next({ headers });

  const expected = process.env.SITE_BASIC_AUTH;
  if (!expected) return pass();

  // Open to everyone, so crawlers read the Disallow instead of a 401.
  if (request.nextUrl.pathname === "/robots.txt") {
    return new NextResponse("User-agent: *\nDisallow: /\n", {
      headers: {
        ...GATED_HEADERS,
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  if (!authorized(request.headers.get("authorization"), expected)) {
    return new NextResponse("Strona jest jeszcze w przygotowaniu.", {
      status: 401,
      headers: {
        ...GATED_HEADERS,
        "WWW-Authenticate": 'Basic realm="conaulicy", charset="UTF-8"',
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  return pass(GATED_HEADERS);
}

export const config = {
  // Everything except hashed build assets (fonts included) and the
  // revalidate hook (it checks its own secret).
  matcher: ["/((?!_next/static/|api/revalidate).*)"],
};
