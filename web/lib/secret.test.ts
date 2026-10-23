import assert from "node:assert/strict";
import { test } from "node:test";
import { sameSecret } from "./secret.ts";

test("sameSecret: only the exact secret", () => {
  assert.equal(sameSecret("Bearer abc", "Bearer abc"), true);
  assert.equal(sameSecret("Bearer abd", "Bearer abc"), false);
  assert.equal(sameSecret("Bearer ab", "Bearer abc"), false);
  assert.equal(sameSecret("", "Bearer abc"), false);
  assert.equal(sameSecret("user:pässword", "user:pässword"), true);
});
