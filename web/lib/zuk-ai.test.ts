import assert from "node:assert/strict";
import { test } from "node:test";
import { gminaLubaczow } from "./sources/gmina-lubaczow/index.ts";
import { costUsd, parseAiResult, readWithAi, ZUK_MODEL } from "./zuk-ai.ts";
import { PLACES, reading } from "./zuk-fixture.ts";

const SYSTEM = gminaLubaczow.systemPrompt(PLACES);

const INPUT = {
  published: "2026-10-20T11:40:25",
  title: "Przerwa w dostawie wody – 21.10.2026",
  text: "w dniu: 21.10.2026r. (środa) nastąpi przerwa",
};
// xAI's usage for post 39865 (feasibility run, 25 Oct 2026).
const USAGE = {
  prompt_tokens: 2158,
  completion_tokens: 400,
  total_tokens: 3374,
  completion_tokens_details: { reasoning_tokens: 816 },
};

function xai(status: number, content: string) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetcher = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return Response.json(
      {
        model: ZUK_MODEL,
        usage: USAGE,
        choices: [{ message: { content } }],
      },
      { status },
    );
  }) as typeof fetch;
  return { calls, fetcher };
}

test("request: grok-4.7, reasoning medium, temperature 0, strict schema", async () => {
  const { calls, fetcher } = xai(200, JSON.stringify(reading(39865)));
  await readWithAi(INPUT, SYSTEM, "test-key", fetcher);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.x.ai/v1/chat/completions");
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer test-key");
  const body = JSON.parse(calls[0].init.body as string);
  assert.equal(body.model, "grok-4.7");
  assert.equal(body.reasoning_effort, "medium");
  assert.equal(body.temperature, 0);
  assert.equal(body.response_format.json_schema.strict, true);
  const item = body.response_format.json_schema.schema.properties.items.items;
  assert.ok(item.required.includes("locality_verbatim"));
  assert.ok(item.required.includes("street_verbatim"));
  assert.ok(!("place_verbatim" in item.properties));
  assert.ok(item.required.includes("note"));
  assert.ok(!("houses" in item.properties));
  assert.equal(body.messages[0].role, "system");
  assert.equal(body.messages[0].content, SYSTEM);
  assert.match(
    body.messages[1].content,
    /^Publish date: 2026-10-20T11:40:25\nTitle: Przerwa/,
  );
  assert.ok(calls[0].init.signal, "a timeout");
});

test("reply: the reading, tokens and cost (reasoning billed as output)", async () => {
  const { fetcher } = xai(200, JSON.stringify(reading(39865)));
  const read = await readWithAi(INPUT, SYSTEM, "test-key", fetcher);
  assert.deepEqual(read.result, reading(39865));
  assert.deepEqual(read.usage, {
    promptTokens: 2158,
    completionTokens: 400,
    reasoningTokens: 816,
  });
  // 2158 × $2/1M + (400 + 816) × $6/1M.
  assert.equal(read.costUsd.toFixed(6), "0.011612");
  assert.equal(read.model, "grok-4.7");
  assert.ok(read.latencyMs >= 0);
});

test("reply: an HTTP error or a reply off the schema throws", async () => {
  await assert.rejects(
    readWithAi(INPUT, SYSTEM, "k", xai(503, "{}").fetcher),
    /xAI: HTTP 503/,
  );
  await assert.rejects(
    readWithAi(INPUT, SYSTEM, "k", xai(200, "not json").fetcher),
    /not the schema/,
  );
});

test("schema check: every field, with its type", () => {
  const good = reading(39885);
  assert.deepEqual(parseAiResult(JSON.stringify(good)), good);
  const drop = (key: string) => {
    const item: Record<string, unknown> = { ...good.items[0] };
    delete item[key];
    return JSON.stringify({ ...good, items: [item] });
  };
  for (const key of [
    "date",
    "locality_verbatim",
    "street_verbatim",
    "note",
    "kind",
    "locality",
    "end_estimated",
    "whole_town",
    "whole_town_verbatim",
    "doubt",
    "suggested_places",
  ])
    assert.equal(parseAiResult(drop(key)), null, key);
  const bad = (over: object) =>
    JSON.stringify({ ...good, items: [{ ...good.items[0], ...over }] });
  assert.equal(parseAiResult(bad({ start: "8:00" })), null);
  assert.equal(parseAiResult(bad({ date: "26.10.2026" })), null);
  assert.equal(parseAiResult(bad({ kind: "revoked" })), null);
  assert.equal(parseAiResult(bad({ locality_verbatim: " " })), null);
  assert.equal(parseAiResult(bad({ street_verbatim: "" })), null);
  assert.equal(parseAiResult(bad({ suggested_places: [""] })), null);
  assert.equal(parseAiResult(bad({ whole_town: "no" })), null);
  // A place off the list: no locality, its words kept.
  const off = { locality: null, locality_verbatim: "Nowe Sioło" };
  assert.ok(parseAiResult(bad(off)));
  assert.equal(parseAiResult('{"items": []}'), null);
});

test("schema check: post_type and quality_status, the quality item kind", () => {
  const good = reading(39885);
  const top = (over: object) => JSON.stringify({ ...good, ...over });
  assert.equal(parseAiResult(top({ post_type: "outage" })), null);
  assert.equal(parseAiResult(top({ post_type: undefined })), null);
  assert.equal(parseAiResult(top({ quality_status: "maybe" })), null);
  assert.equal(parseAiResult(top({ quality_status: undefined })), null);
  assert.equal(parseAiResult(top({ changes_earlier_dates: undefined })), null);
  // The old field alone is no longer the schema.
  const { post_type, ...old } = good;
  assert.equal(post_type, "water_outage");
  assert.equal(
    parseAiResult(JSON.stringify({ ...old, is_outage_notice: true })),
    null,
  );
  const quality = {
    ...good,
    post_type: "water_quality",
    quality_status: "warning",
    items: [{ ...good.items[0], start: null, end: null, kind: "quality" }],
  };
  assert.deepEqual(parseAiResult(JSON.stringify(quality)), quality);
});

test("request: post_type and quality_status required, quality items allowed", async () => {
  const { calls, fetcher } = xai(200, JSON.stringify(reading(39865)));
  await readWithAi(INPUT, SYSTEM, "test-key", fetcher);
  const schema = JSON.parse(calls[0].init.body as string).response_format
    .json_schema.schema;
  assert.deepEqual(schema.required, [
    "post_type",
    "quality_status",
    "is_past",
    "changes_earlier_dates",
    "items",
  ]);
  const item = schema.properties.items.items;
  assert.deepEqual(item.required, Object.keys(item.properties));
  assert.deepEqual(item.properties.locality.type, ["string", "null"]);
  assert.deepEqual(schema.properties.post_type.enum, [
    "water_outage",
    "water_quality",
    "other",
  ]);
  assert.deepEqual(schema.properties.quality_status.enum, [
    "warning",
    "lifted",
    null,
  ]);
  assert.ok(!("is_outage_notice" in schema.properties));
  assert.deepEqual(schema.properties.items.items.properties.kind.enum, [
    "planned",
    "emergency",
    "quality",
  ]);
});

test("cost: list price", () => {
  assert.equal(
    costUsd({
      promptTokens: 1_000_000,
      completionTokens: 0,
      reasoningTokens: 0,
    }),
    2,
  );
  assert.equal(
    costUsd({
      promptTokens: 0,
      completionTokens: 500_000,
      reasoningTokens: 500_000,
    }),
    6,
  );
});
