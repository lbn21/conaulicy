import assert from "node:assert/strict";
import { test } from "node:test";
import { imgwPreview, imgwPreviewAllowed } from "./imgw-preview.ts";

// ?imgw=: the IMGW mock on a Preview, never in production.
const PREVIEW = { VERCEL_ENV: "preview" };
const PRODUCTION = { VERCEL_ENV: "production" };

test("?imgw=: levels, more warnings and a start, as the mock's URL", () => {
  const cases: Array<[unknown, string | null]> = [
    ["2", "mock:1809?level=2"],
    ["3,1", "mock:1809?level=3&also=1"],
    ["1,2,3,2", "mock:1809?level=1&also=2%2C3"],
    ["1,upcoming", "mock:1809?level=1&start=upcoming"],
    ["night,2", "mock:1809?level=2&start=night"],
    // Nothing to show: no mock.
    ["", null],
    ["4", null],
    ["upcoming", null],
    [undefined, null],
    [["2", "3"], null],
  ];
  for (const [value, url] of cases)
    assert.equal(imgwPreview(value, PREVIEW), url, String(value));
  // Development (no VERCEL_ENV) as a Preview.
  assert.equal(imgwPreview("2", {}), "mock:1809?level=2");
});

test("?imgw= is ignored in production", () => {
  assert.equal(imgwPreviewAllowed(PRODUCTION), false);
  assert.equal(imgwPreviewAllowed(PREVIEW), true);
  assert.equal(imgwPreviewAllowed({}), true);
  for (const value of ["1", "3,1", "1,upcoming"])
    assert.equal(imgwPreview(value, PRODUCTION), null, value);
});
