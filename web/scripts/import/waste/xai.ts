// Grok reads one schedule image (task 191): one chat/completions call
// through lib/zuk-ai.ts (callXai, shared with the water reader), exactly as
// the dry run sent it: one user message, the prompt and then the image
// inline (detail high); no system message, temperature or response_format.
// No retries here: the import core's issue handling and the next run do
// that. XAI_MOCK_DIR (scripts/check-import-run.mjs): the reply from a file
// and the request saved beside it, never the network.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { callXai, type XaiReply, ZUK_MODEL } from "../../../lib/zuk-ai.ts";

/** One schedule read at most this long (final city runs took 166–226 s). */
export const WASTE_TIMEOUT_MS = 300_000;

export type Image = { body: Buffer; mime: "image/png" | "image/jpeg" };

/** The request's messages: the prompt, then the image as a data URI. */
function scheduleMessages(prompt: string, image: Image) {
  return [
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        {
          type: "image_url",
          image_url: {
            url: `data:${image.mime};base64,${image.body.toString("base64")}`,
            detail: "high",
          },
        },
      ],
    },
  ];
}

/** Tests: <dir>/<name>.json is the reply content; the request lands beside it. */
function mockFetcher(dir: string, name: string): typeof fetch {
  return (async (_url: string | URL, init?: RequestInit) => {
    writeFileSync(path.join(dir, `${name}.request.json`), String(init?.body));
    const reply = path.join(dir, `${name}.json`);
    if (!existsSync(reply)) return new Response("{}", { status: 500 });
    return Response.json({
      model: ZUK_MODEL,
      usage: { prompt_tokens: 1, completion_tokens: 1 },
      choices: [{ message: { content: readFileSync(reply, "utf8") } }],
    });
  }) as typeof fetch;
}

/**
 * One schedule image read by Grok: the reply as given, with its model,
 * tokens, cost and time (logged, never the prompt, image or key). Throws
 * when XAI_API_KEY is missing, on an HTTP error or a timeout.
 */
export async function readSchedule(
  prompt: string,
  image: Image,
  /** The file, in the log and the mock's file names. */
  name: string,
  deps: { fetcher?: typeof fetch; apiKey?: string } = {},
): Promise<XaiReply> {
  const mock = process.env.XAI_MOCK_DIR;
  const apiKey = deps.apiKey ?? process.env.XAI_API_KEY;
  if (!apiKey && !mock)
    throw new Error("XAI_API_KEY is not set, the schedule cannot be read");
  const reply = await callXai(
    { messages: scheduleMessages(prompt, image) },
    apiKey ?? "",
    deps.fetcher ?? (mock ? mockFetcher(mock, name) : fetch),
    WASTE_TIMEOUT_MS,
  );
  const { promptTokens, completionTokens, reasoningTokens } = reply.usage;
  console.log(
    `  ${name}: ${reply.model}, tokens ${promptTokens} prompt, ${completionTokens} completion, ${reasoningTokens} reasoning; $${reply.costUsd.toFixed(4)}; ${Math.round(reply.latencyMs / 1000)} s`,
  );
  return reply;
}
