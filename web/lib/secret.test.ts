import assert from "node:assert/strict";
import { test } from "node:test";
import { cronDenied, sameSecret } from "./secret.ts";

test("sameSecret: only the exact secret", () => {
  assert.equal(sameSecret("Bearer abc", "Bearer abc"), true);
  assert.equal(sameSecret("Bearer abd", "Bearer abc"), false);
  assert.equal(sameSecret("Bearer ab", "Bearer abc"), false);
  assert.equal(sameSecret("", "Bearer abc"), false);
  assert.equal(sameSecret("user:pässword", "user:pässword"), true);
});

// Every cron route's gate (lib/zuk-cron.ts, lib/import-cron.ts); the routes'
// own tests check only that they use it.
test("cronDenied: Vercel Cron's bearer secret, nothing else", () => {
  const SECRET = "cron-secret";
  const denied = (auth: string | null, secret: string | undefined = SECRET) =>
    cronDenied(
      new Request("https://conaulicy.pl/api/cron/x", {
        headers: auth ? { authorization: auth } : {},
      }),
      secret,
    );
  for (const [auth, secret] of [
    [null, SECRET],
    ["Bearer wrong", SECRET],
    [SECRET, SECRET],
    // No CRON_SECRET set: nobody gets in.
    ["Bearer ", ""],
    ["Bearer undefined", undefined],
  ] as const) {
    const response = denied(auth, secret);
    assert.equal(response?.status, 401, String(auth));
    assert.equal(response?.headers.get("cache-control"), "no-store");
  }
  assert.equal(denied(`Bearer ${SECRET}`), null);
});
