import assert from "node:assert/strict";
import { test } from "node:test";
import { IMGW_SCENARIOS, imgwPreviewParams } from "./imgw-preview.ts";

// /podglad/imgw/<scenario>: the IMGW mock on a Preview, never in
// production (no pages there: the route's 404).

test("every scenario a page outside production, none in production", () => {
  const names = Object.keys(IMGW_SCENARIOS);
  for (const env of [{ VERCEL_ENV: "preview" }, {}])
    assert.deepEqual(
      imgwPreviewParams(env).map((p) => p.scenario),
      names,
    );
  assert.deepEqual(imgwPreviewParams({ VERCEL_ENV: "production" }), []);
});

test("each scenario is the mock's: a plain path segment, a mock: URL", () => {
  for (const [name, url] of Object.entries(IMGW_SCENARIOS)) {
    assert.match(name, /^[a-z0-9-]+$/, name);
    assert.match(url, /^mock:(1809|none)\?/, name);
  }
});
