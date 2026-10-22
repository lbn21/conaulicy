import assert from "node:assert/strict";
import { test } from "node:test";
import { indexable } from "./indexing.ts";

test("indexable only on production without the gate", () => {
  assert.equal(indexable({ VERCEL_ENV: "production" }), true);
  assert.equal(
    indexable({ VERCEL_ENV: "production", SITE_BASIC_AUTH: "u:p" }),
    false,
  );
  assert.equal(indexable({ VERCEL_ENV: "preview" }), false);
  assert.equal(
    indexable({ VERCEL_ENV: "preview", SITE_BASIC_AUTH: "u:p" }),
    false,
  );
  assert.equal(indexable({}), false);
  assert.equal(indexable({ SITE_BASIC_AUTH: "u:p" }), false);
});

test("an empty SITE_BASIC_AUTH is no gate, as in proxy.ts", () => {
  assert.equal(
    indexable({ VERCEL_ENV: "production", SITE_BASIC_AUTH: "" }),
    true,
  );
});
