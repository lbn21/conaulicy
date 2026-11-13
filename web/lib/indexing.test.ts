import assert from "node:assert/strict";
import { test } from "node:test";
import { indexable } from "./indexing.ts";

test("indexable only on a production deployment", () => {
  assert.equal(indexable({ VERCEL_ENV: "production" }), true);
  assert.equal(indexable({ VERCEL_ENV: "preview" }), false);
  assert.equal(indexable({ VERCEL_ENV: "development" }), false);
  assert.equal(indexable({}), false);
});
