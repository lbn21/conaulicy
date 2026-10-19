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

export function proxy(request: NextRequest) {
  const expected = process.env.SITE_BASIC_AUTH;
  if (!expected) return NextResponse.next();

  if (!authorized(request.headers.get("authorization"), expected)) {
    return new NextResponse("Strona jest jeszcze w przygotowaniu.", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="conaulicy", charset="UTF-8"',
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  // Everything except hashed build assets and the public font files.
  matcher: ["/((?!_next/static/|fonts/).*)"],
};
