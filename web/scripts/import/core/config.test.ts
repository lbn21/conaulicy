import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  configErrors,
  cronLines,
  loadConfig,
  localNow,
  SCHEMA_FILE,
  schemaErrors,
} from "./config.ts";
import { linksHash, pageLinks } from "./watch.ts";

const schema = JSON.parse(readFileSync(SCHEMA_FILE, "utf8"));

test("etl/sources.yaml is valid", () => {
  const config = loadConfig();
  assert.ok(config.sources.length >= 2);
  assert.equal(config.vision.passes.length, 2);
});

test("vision passes: two vendors or one, as long as the ids differ", () => {
  const config = structuredClone(loadConfig());
  const passErrors = () =>
    [...schemaErrors(config, schema), ...configErrors(config)].filter((e) =>
      e.includes("passes"),
    );
  config.vision.passes[0].vendor = "xai";
  config.vision.passes[1].vendor = "anthropic";
  assert.deepEqual(passErrors(), []);
  config.vision.passes[1] = { ...config.vision.passes[0], id: "grok-b" };
  assert.deepEqual(passErrors(), []);
});

test("the schema rejects unknown keys, bad types and banned models", () => {
  const config = structuredClone(loadConfig());
  (config as Record<string, unknown>).extra = 1;
  config.schedule.time = "5:00";
  config.vision.passes[0].model = "claude-opus-5-5-fast";
  config.vision.passes[1].model = "auto";
  const errors = schemaErrors(config, schema).join("\n");
  assert.match(errors, /\$\.extra: unknown key/);
  assert.match(errors, /schedule\.time/);
  assert.match(errors, /passes\[0\]\.model/);
  assert.match(errors, /passes\[1\]\.model/);
});

test("rules beyond the schema: pass ids, hosts, patterns", () => {
  const config = structuredClone(loadConfig());
  config.vision.passes[1].id = config.vision.passes[0].id;
  config.sources[0].page =
    "https://conaulicy-sources-aaed02.s3.amazonaws.com/x.pdf";
  config.sources[1].detect.file = "^harmonogram\\.jpg$";
  const errors = configErrors(config).join("\n");
  assert.match(errors, /duplicate pass id/);
  assert.match(errors, /is not on www\.gminalubaczow\.pl/);
  assert.match(errors, /needs \(\?<sector>/);
});

test("crons: one per UTC offset, none when disabled", () => {
  const warsaw = { enabled: true, time: "05:00", timezone: "Europe/Warsaw" };
  assert.deepEqual(cronLines(warsaw), ["0 3 * * *", "0 4 * * *"]);
  assert.deepEqual(cronLines({ ...warsaw, timezone: "UTC" }), ["0 5 * * *"]);
  assert.deepEqual(cronLines({ ...warsaw, enabled: false }), []);
  assert.deepEqual(
    localNow("Europe/Warsaw", new Date("2026-07-01T03:30:00Z")),
    { date: "2026-07-01", hour: 5 },
  );
  assert.deepEqual(
    localNow("Europe/Warsaw", new Date("2026-12-31T23:30:00Z")),
    { date: "2027-01-01", hour: 0 },
  );
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
