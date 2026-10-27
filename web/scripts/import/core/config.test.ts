import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  configErrors,
  loadConfig,
  SCHEMA_FILE,
  schemaErrors,
} from "./config.ts";
import { linksHash, pageLinks } from "./watch.ts";

const schema = JSON.parse(readFileSync(SCHEMA_FILE, "utf8"));

test("etl/sources.yaml is valid", () => {
  const config = loadConfig();
  assert.ok(config.sources.length >= 2);
});

test("the schema rejects unknown keys, bad types and a missing layout", () => {
  const config = structuredClone(loadConfig());
  (config as Record<string, unknown>).extra = 1;
  config.sources[0].extract = { type: "gmina-pdf-text", layout: "gmina" };
  delete config.sources[1].extract.layout;
  const errors = schemaErrors(config, schema).join("\n");
  assert.match(errors, /\$\.extra: unknown key/);
  assert.match(errors, /sources\[0\]\.extract\.type: must be one of waste-ai/);
  assert.match(errors, /sources\[1\]\.extract\.layout: required/);
});

test("rules beyond the schema: hosts, patterns", () => {
  const config = structuredClone(loadConfig());
  config.sources[0].page =
    "https://conaulicy-sources-aaed02.s3.amazonaws.com/x.pdf";
  config.sources[1].detect.file = "^harmonogram\\.jpg$";
  const errors = configErrors(config).join("\n");
  assert.match(errors, /is not on www\.gminalubaczow\.pl/);
  assert.match(errors, /needs \(\?<sector>/);
});

test("page links: absolute, matching, sorted; the hash ignores the rest", () => {
  const html = `<a href="/wp-content/uploads/b.jpg">B</a><img src="https://x.pl/wp-content/uploads/a.jpg">
    <a href="https://x.pl/other.html">x</a><a href="https://x.pl/wp-content/uploads/b.jpg">again</a>`;
  const links = pageLinks(
    html,
    "https://x.pl/page/",
    "^https://x\\.pl/wp-content/uploads/.+\\.jpg$",
  );
  assert.deepEqual(links, [
    "https://x.pl/wp-content/uploads/a.jpg",
    "https://x.pl/wp-content/uploads/b.jpg",
  ]);
  const noisy = `${html}<div class="calendar">${Date.now()}</div>`;
  assert.equal(
    linksHash(
      pageLinks(
        noisy,
        "https://x.pl/page/",
        "^https://x\\.pl/wp-content/uploads/.+\\.jpg$",
      ),
    ),
    linksHash(links),
  );
});
