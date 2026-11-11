// The waste client: the request exactly as the dry run sent it,
// and every way it fails without the key in the message. xAI is always
// mocked (an injected fetcher); no test reaches the network.
import assert from "node:assert/strict";
import { test } from "node:test";
import { callXai } from "../../../lib/zuk-ai.ts";
import { schedulePrompt } from "./prompts.ts";
import { readSchedule, WASTE_TIMEOUT_MS } from "./xai.ts";

// The client sends the image's bytes as given: a PNG's signature, a JPG's
// markers, never a real schedule.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

const KEY = "xai-test-key-never-shown";
const recorder = (status = 200) => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetcher = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return Response.json(
      {
        model: "grok-4.7",
        usage: {
          prompt_tokens: 3000,
          completion_tokens: 900,
          completion_tokens_details: { reasoning_tokens: 9000 },
        },
        choices: [{ message: { content: '{"a": 1}' } }],
      },
      { status },
    );
  }) as typeof fetch;
  return { calls, fetcher };
};

test("waste request: model, effort, one user message, prompt then image as given (pinned)", async () => {
  const prompt = schedulePrompt("gmina").text;
  const { calls, fetcher } = recorder();
  const reply = await readSchedule(
    prompt,
    { body: PNG, mime: "image/png" },
    "gmina-s1-2026",
    { fetcher, apiKey: KEY },
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.x.ai/v1/chat/completions");
  assert.deepEqual(calls[0].init.headers, {
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
  });
  // The whole body, key order included: no system message, no temperature,
  // no response_format (the dry run had none).
  assert.equal(
    calls[0].init.body,
    JSON.stringify({
      model: "grok-4.7",
      reasoning_effort: "medium",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${PNG.toString("base64")}`,
                detail: "high",
              },
            },
          ],
        },
      ],
    }),
  );
  assert.ok(calls[0].init.signal, "a timeout");
  assert.equal(WASTE_TIMEOUT_MS, 300_000);
  assert.equal(reply.content, '{"a": 1}');
  assert.deepEqual(reply.usage, {
    promptTokens: 3000,
    completionTokens: 900,
    reasoningTokens: 9000,
  });
  // 3000 × $2/1M + (900 + 9000) × $6/1M.
  assert.equal(reply.costUsd.toFixed(4), "0.0654");
  // A JPG goes as image/jpeg, as is.
  await readSchedule("p", { body: JPG, mime: "image/jpeg" }, "miasto-s1", {
    fetcher,
    apiKey: KEY,
  });
  assert.equal(
    JSON.parse(calls[1].init.body as string).messages[0].content[1].image_url
      .url,
    `data:image/jpeg;base64,${JPG.toString("base64")}`,
  );
});

test("waste client: HTTP 500, a timeout, no key: it fails, the key never shown", async () => {
  const image = { body: PNG, mime: "image/png" as const };
  const deps = { fetcher: recorder(500).fetcher, apiKey: KEY };
  await assert.rejects(readSchedule("p", image, "x", deps), (error: Error) => {
    assert.equal(error.message, "xAI: HTTP 500");
    return true;
  });
  const timedOut = (async () => {
    throw new DOMException(
      "The operation was aborted due to timeout",
      "TimeoutError",
    );
  }) as typeof fetch;
  await assert.rejects(
    readSchedule("p", image, "x", { fetcher: timedOut, apiKey: KEY }),
    (error: Error) => {
      assert.equal(error.name, "TimeoutError");
      assert.ok(!error.message.includes(KEY));
      return true;
    },
  );
  const saved = process.env.XAI_API_KEY;
  delete process.env.XAI_API_KEY;
  await assert.rejects(
    readSchedule("p", image, "x", { fetcher: recorder().fetcher }),
    /^Error: XAI_API_KEY is not set, the schedule cannot be read$/,
  );
  if (saved !== undefined) process.env.XAI_API_KEY = saved;
});

test("callXai: the timeout aborts the call", async () => {
  const waits = ((_url: string | URL, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(init.signal?.reason),
      );
    })) as typeof fetch;
  await assert.rejects(
    callXai({ messages: [] }, KEY, waits, 20),
    (error: Error) => error.name === "TimeoutError",
  );
});
