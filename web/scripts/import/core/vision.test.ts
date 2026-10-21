// The vision passes run at once; one that fails fails the file, as before.
// The Cursor CLI is replaced by a fake `agent` that logs its calls.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { Config } from "./config.ts";
import { visionPasses } from "./vision.ts";

const dir = mkdtempSync(path.join(tmpdir(), "vision-test-"));
const bin = path.join(dir, "bin");
const log = path.join(dir, "agent.log");
mkdirSync(bin);
// `agent models` lists both models; a pass with bad-model fails, any other
// replies after a second, so both passes overlap if they run at once.
writeFileSync(
  path.join(bin, "agent"),
  `#!/bin/sh
if [ "$1" = models ]; then echo "good-model bad-model"; exit 0; fi
model=""; prev=""
for a in "$@"; do [ "$prev" = --model ] && model="$a"; prev="$a"; done
echo "start $model $(ls)" >> "${log}"
if [ "$model" = bad-model ]; then echo "boom" >&2; exit 3; fi
sleep 1
echo "end $model" >> "${log}"
echo '{"result":"{\\"ok\\":1}"}'
`,
  { mode: 0o755 },
);
process.env.PATH = `${bin}:${process.env.PATH}`;
process.env.CURSOR_API_KEY = "fake";
delete process.env.CURSOR_AGENT_MOCK;

const config = (models: string[]) =>
  ({
    vision: {
      passes: models.map((model, i) => ({
        id: `p${i + 1}`,
        vendor: "x",
        model,
      })),
    },
  }) as unknown as Config;
const run = (models: string[]) =>
  visionPasses(config(models), Buffer.from("PNG"), ".PNG", (i) => i, "m");

test("both passes run at once, each with the image under its own extension", async () => {
  writeFileSync(log, "");
  const started = Date.now();
  assert.deepEqual(await run(["good-model", "good-model"]), [
    '{"ok":1}',
    '{"ok":1}',
  ]);
  assert.ok(Date.now() - started < 1900, "the passes ran one after another");
  const lines = readFileSync(log, "utf8").trim().split("\n");
  assert.deepEqual(
    lines.filter((l) => l.startsWith("start")),
    ["start good-model source.png", "start good-model source.png"],
  );
});

test("one pass fails, the other succeeds: the file fails with that pass's error", async () => {
  for (const models of [
    ["good-model", "bad-model"],
    ["bad-model", "good-model"],
  ]) {
    writeFileSync(log, "");
    const bad = `p${models.indexOf("bad-model") + 1}`;
    await assert.rejects(
      run(models),
      new RegExp(`^Error: pass ${bad} \\(bad-model\\): agent exited 3: boom`),
    );
    // The other pass still ran to the end.
    assert.match(readFileSync(log, "utf8"), /end good-model/);
  }
});
