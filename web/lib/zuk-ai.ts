// Grok reads one post (xAI chat/completions, structured output): what it is
// (post_type) and, for a water post, its items. Shared by every source: the
// schema, the reply check and the call; the prompt is the source's own
// (lib/sources/<id>/prompt.ts). What it returns is a claim, not a fact:
// lib/zuk-guards.ts checks every value against the post's own text and
// lib/zuk-resolve.ts maps the places to ours; a place that fails is
// dropped, a date or time that fails makes the post a Notice. It never
// returns ids: our code has the last word (lib/zuk-resolve.ts).

export const ZUK_MODEL = "grok-4.7";

const XAI_URL = "https://api.x.ai/v1/chat/completions";
const TIMEOUT_MS = 60_000;
// USD per token, list price; reasoning tokens are billed as output.
const PRICE_IN = 2 / 1_000_000;
const PRICE_OUT = 6 / 1_000_000;

export type AiItem = {
  /**
   * YYYY-MM-DD: the day the cut starts; for water_quality the day the
   * warning starts, or ends if lifted.
   */
  date: string;
  /** HH:MM or null. */
  start: string | null;
  end: string | null;
  /** As written: "Lubaczów", "Załuże–Podłęże". */
  locality: string;
  /** As written, without "ul.": "Pilipy"; null for the whole locality. */
  street: string | null;
  /** The exact phrase naming this place: "Młodów, ul. Pilipy". */
  place_verbatim: string;
  /** The text's own qualifier: "w części miejscowości", or null. */
  note: string | null;
  /** "quality" for a water_quality post's places. */
  kind: "planned" | "emergency" | "quality";
};

/** What the post is: only a water_outage is read for cuts. */
type PostType = "water_outage" | "water_quality" | "other";

export type AiResult = {
  post_type: PostType;
  /** water_quality only, else null. */
  quality_status: "warning" | "lifted" | null;
  is_past: boolean;
  items: AiItem[];
};

export type AiUsage = {
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
};

export type AiReading = {
  result: AiResult;
  model: string;
  usage: AiUsage;
  costUsd: number;
  latencyMs: number;
};

const nullable = (type: string, description: string) => ({
  type: [type, "null"],
  description,
});

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["post_type", "quality_status", "is_past", "items"],
  properties: {
    post_type: {
      type: "string",
      enum: ["water_outage", "water_quality", "other"],
    },
    quality_status: {
      type: ["string", "null"],
      enum: ["warning", "lifted", null],
      description: "non-null only for water_quality",
    },
    is_past: {
      type: "boolean",
      description:
        "true if the text reports an interruption that already happened (past tense, e.g. 'nastąpiła'), not one announced for the future",
    },
    items: {
      type: "array",
      description:
        "[] for other. For water_quality: one item per affected place; date = day the warning starts (or the publish date if the text says it applies now), start/end null, kind 'quality'; for 'lifted', the places where the warning ends, date = day it ends.",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "date",
          "start",
          "end",
          "locality",
          "street",
          "place_verbatim",
          "note",
          "kind",
        ],
        properties: {
          date: {
            type: "string",
            format: "date",
            description: "day the interruption starts, YYYY-MM-DD",
          },
          start: nullable("string", "HH:MM, null if not stated"),
          end: nullable(
            "string",
            "HH:MM, null if not stated; may be on the next day for night spans",
          ),
          locality: {
            type: "string",
            description: "locality name copied exactly as written in the text",
          },
          street: nullable(
            "string",
            "street name copied exactly as written, without 'ul.'; null if the whole locality",
          ),
          place_verbatim: {
            type: "string",
            description:
              "the shortest exact substring of the text naming this place: from the locality through this item's street, with its house numbers and qualifiers, e.g. 'Młodów, ul. Pilipy', 'Opaka od nr 104 do nr 110'",
          },
          note: nullable(
            "string",
            "a qualifier of the place copied exactly, e.g. 'w części miejscowości', 'gospodarstwa zasilane z SUW Mokrzyca'; null if none",
          ),
          kind: { type: "string", enum: ["planned", "emergency", "quality"] },
        },
      },
    },
  },
};

export type AiInput = {
  /** Site time, "2026-10-23T18:59:43". */
  published: string;
  title: string;
  /** Plain text, one paragraph or list item per line. */
  text: string;
};

const isTime = (v: unknown) =>
  v === null || (typeof v === "string" && /^\d{2}:\d{2}$/.test(v));
const isText = (v: unknown) => typeof v === "string" && v.trim() !== "";
const orNull = (v: unknown) => v === null || isText(v);

function isItem(v: unknown): v is AiItem {
  const i = v as Record<string, unknown>;
  return (
    typeof i === "object" &&
    i !== null &&
    typeof i.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(i.date) &&
    isTime(i.start) &&
    isTime(i.end) &&
    isText(i.locality) &&
    orNull(i.street) &&
    isText(i.place_verbatim) &&
    orNull(i.note) &&
    (i.kind === "planned" || i.kind === "emergency" || i.kind === "quality")
  );
}

const POST_TYPES: PostType[] = ["water_outage", "water_quality", "other"];

/** The model's JSON, or null if it does not have the schema's shape. */
export function parseAiResult(content: string): AiResult | null {
  let v: Record<string, unknown>;
  try {
    v = JSON.parse(content);
  } catch {
    return null;
  }
  if (
    typeof v !== "object" ||
    v === null ||
    !POST_TYPES.includes(v.post_type as PostType) ||
    !(
      v.quality_status === null ||
      v.quality_status === "warning" ||
      v.quality_status === "lifted"
    ) ||
    typeof v.is_past !== "boolean" ||
    !Array.isArray(v.items) ||
    !v.items.every(isItem)
  )
    return null;
  return v as AiResult;
}

/** USD at list price, reasoning billed as output. */
export function costUsd(usage: AiUsage): number {
  return (
    usage.promptTokens * PRICE_IN +
    (usage.completionTokens + usage.reasoningTokens) * PRICE_OUT
  );
}

const count = (v: unknown) => (typeof v === "number" ? v : 0);

/**
 * One post read by the model, `system` the source's prompt. Throws on a
 * network or HTTP error, a timeout or a reply that is not the schema; never
 * logs the key.
 */
export async function readWithAi(
  input: AiInput,
  system: string,
  apiKey: string,
  fetcher: typeof fetch = fetch,
): Promise<AiReading> {
  const started = Date.now();
  const response = await fetcher(XAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ZUK_MODEL,
      reasoning_effort: "low",
      temperature: 0,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Publish date: ${input.published}\nTitle: ${input.title}\n\nText:\n${input.text}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "zuk", schema: SCHEMA, strict: true },
      },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`xAI: HTTP ${response.status}`);
  const body = (await response.json()) as {
    model?: string;
    usage?: Record<string, unknown>;
    choices?: Array<{ message?: { content?: string } }>;
  };
  const result = parseAiResult(body.choices?.[0]?.message?.content ?? "");
  if (!result) throw new Error("xAI: reply is not the schema");
  const u = body.usage ?? {};
  const usage: AiUsage = {
    promptTokens: count(u.prompt_tokens),
    completionTokens: count(u.completion_tokens),
    reasoningTokens: count(
      (u.completion_tokens_details as Record<string, unknown> | undefined)
        ?.reasoning_tokens,
    ),
  };
  return {
    result,
    model: body.model ?? ZUK_MODEL,
    usage,
    costUsd: costUsd(usage),
    latencyMs: Date.now() - started,
  };
}
