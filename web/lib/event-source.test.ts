import assert from "node:assert/strict";
import { test } from "node:test";
import { hasSource, missingSource } from "./event-source.ts";

const SOURCE = "https://www.lubaczow.com.pl/harmonogram-odbioru-odpadow-2026";

test("source rule: an http(s) source url and a checkedAt day pass", () => {
  for (const sourceUrl of [SOURCE, "http://example.org/a.pdf", ` ${SOURCE} `])
    assert.equal(missingSource({ sourceUrl, checkedAt: "2026-10-25" }), null);
  assert.ok(hasSource({ sourceUrl: SOURCE, checkedAt: "2026-10-25" }));
});

test("source rule: no url, a blank one or one that is not http(s) fails", () => {
  for (const sourceUrl of [undefined, null, "", "   "])
    assert.equal(
      missingSource({ sourceUrl, checkedAt: "2026-10-25" }),
      "has no source url",
    );
  for (const sourceUrl of [
    "ftp://example.org/a.pdf",
    "javascript:alert(1)",
    "docs/data/test/miasto-s1.txt",
    "www.lubaczow.com.pl",
  ]) {
    assert.equal(
      missingSource({ sourceUrl, checkedAt: "2026-10-25" }),
      `source url ${JSON.stringify(sourceUrl)} is not http(s)`,
    );
    assert.ok(!hasSource({ sourceUrl, checkedAt: "2026-10-25" }));
  }
});

test("source rule: no checkedAt, or a blank one, fails", () => {
  for (const checkedAt of [undefined, null, "", "  "]) {
    assert.equal(
      missingSource({ sourceUrl: SOURCE, checkedAt }),
      "has no checkedAt",
    );
    assert.ok(!hasSource({ sourceUrl: SOURCE, checkedAt }));
  }
});
