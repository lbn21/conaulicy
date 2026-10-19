import { createHash, timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";

// Pre-launch gate. Active only when SITE_BASIC_AUTH ("user:password") is set.
// On Vercel the proxy runs before the CDN cache, so a cached page is never
// served to a request that has not passed this check.

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

// Hashing first gives equal-length buffers, so the compare time does not
// depend on where the strings differ or on their lengths.
function authorized(header: string | null, expected: string): boolean {
  if (!header?.startsWith("Basic ")) return false;
  let given: string;
  try {
    given = Buffer.from(header.slice(6), "base64").toString("utf8");
  } catch {
    return false;
  }
  return timingSafeEqual(digest(given), digest(expected));
}

// While gated: never indexed, and never stored by a shared cache. The CDN is
// already safe (see above), but routes send public s-maxage headers, which
// would let a proxy between the visitor and Vercel keep an authorized copy.
const GATED_HEADERS = {
  "X-Robots-Tag": "noindex, nofollow",
  "Cache-Control": "private, no-store",
};

export function proxy(request: NextRequest) {
  const expected = process.env.SITE_BASIC_AUTH;
  if (!expected) return NextResponse.next();

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

  return NextResponse.next({ headers: GATED_HEADERS });
}

export const config = {
  // Everything except hashed build assets (fonts included) and the
  // revalidate hook (it checks its own secret).
  matcher: ["/((?!_next/static/|api/revalidate).*)"],
};
