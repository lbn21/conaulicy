import assert from "node:assert/strict";
import { test } from "node:test";
import { DISTRICTS } from "../../lib/districts-seed.ts";
import {
  MZGKIM_READINGS,
  realMzgkimPost,
  WITH_ESTATE,
} from "../../lib/mzgkim-fixture.ts";
import { mzgkim } from "../../lib/sources/mzgkim/index.ts";
import type { AiInput } from "../../lib/zuk-ai.ts";
import { ZUK_PLACES } from "../../lib/zuk-places.generated.ts";
import { waterDryRun } from "./water-dry-run.ts";

const places = { ...ZUK_PLACES, districts: DISTRICTS };
const post = realMzgkimPost(WITH_ESTATE);

test("dry run: the model's reading as given, gated as the cron would", async () => {
  const run = await waterDryRun({
    post,
    source: mzgkim,
    places,
    ai: MZGKIM_READINGS[WITH_ESTATE],
    checkedAt: "2026-10-26T18:00:00.000Z",
  });
  assert.equal(run.source, "mzgkim");
  assert.equal(run.call, null);
  assert.equal(run.promptChars, mzgkim.systemPrompt(places).length);
  assert.equal(run.gate.status, "parsed");
  if (run.gate.status !== "parsed") return;
  assert.equal(run.gate.items.length, 4 + 1 + 22);
  assert.deepEqual(run.gate.unmatched, ["Niemirowska wraz z osiedlem"]);
});

test("dry run: the model called with the cron's input, its prompt and key", async () => {
  const inputs: Array<[AiInput, string, string]> = [];
  const run = await waterDryRun({
    post,
    source: mzgkim,
    places,
    xaiKey: "test-key",
    readAi: async (input, system, key) => {
      inputs.push([input, system, key]);
      return {
        result: MZGKIM_READINGS[WITH_ESTATE],
        model: "grok-test",
        usage: { promptTokens: 1, completionTokens: 1, reasoningTokens: 0 },
        costUsd: 0,
        latencyMs: 1,
      };
    },
  });
  const [[input, system, key]] = inputs;
  assert.equal(key, "test-key");
  assert.equal(system, mzgkim.systemPrompt(places));
  assert.equal(input.published, post.date);
  assert.match(input.text, /\nMazury wraz z osiedlem\n/);
  assert.equal(run.call?.model, "grok-test");
  await assert.rejects(
    waterDryRun({ post, source: mzgkim, places }),
    /no XAI_API_KEY/,
  );
});
