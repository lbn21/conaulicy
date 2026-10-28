// Grok reads one post (xAI chat/completions, structured output): what it is
// (post_type) and, for a water post, its items. Shared by every source: the
// schema, the reply check and the call; the prompt is lib/water-prompt.ts.
// What it returns is a claim, not a fact: lib/zuk-resolve.ts checks only
// what is certain (listed names, words in the post, days and times); a
// place that fails is rejected, a date or time that fails makes the post a
// Notice. It never returns ids: our code maps listed names to them.

export const ZUK_MODEL = "grok-4.7";
/** The reasoning effort every call asks for. */
export const ZUK_EFFORT = "medium";

const XAI_URL = "https://api.x.ai/v1/chat/completions";
/** One model call at most this long (a real post took 161 s at medium). */
export const TIMEOUT_MS = 240_000;
// USD per token, list price; reasoning tokens are billed as output.
const PRICE_IN = 2 / 1_000_000;
const PRICE_OUT = 6 / 1_000_000;

export type AiItem = {
  /**
   * YYYY-MM-DD: the day the cut starts; for water_quality the day the
   * warning starts, or ends if lifted.
   */
  date: string;
  /** The post's exact words giving the day; null if it writes none. */
  date_verbatim: string | null;
  /** HH:MM or null. */
  start: string | null;
  end: string | null;
  /** The listed name ("Name (Village)" for a part); null if not listed. */
  locality: string | null;
  /** The post's own words for it; null where the source never names it. */
  locality_verbatim: string | null;
  /** A listed street or district of that locality; null if none. */
  street: string | null;
  /** The post's own words for the street, or for an unlisted one. */
  street_verbatim: string | null;
  /** The place's limitation, one exact quote: "od nr 104 do nr 110". */
  note: string | null;
  /** The note's house numbers: one house has `to` equal, an open range null. */
  houses: { from: string; to: string | null }[];
  /** "quality" for a water_quality post's places. */
  kind: "planned" | "emergency" | "quality";
  /** The end is an expected restore time, not a set one. */
  end_estimated: boolean;
  /** The whole town, in the post's words (whole_town_verbatim). */
  whole_town: boolean;
  whole_town_verbatim: string | null;
  /** A listed district a bare street name may mean instead; else null. */
  doubt: string | null;
  /** For a place not on the list: listed names it may cover. */
  suggested_places: string[];
};

/** What the post is: only a water_outage is read for cuts. */
type PostType = "water_outage" | "water_quality" | "other";

export type AiResult = {
  post_type: PostType;
  /** water_quality only, else null. */
  quality_status: "warning" | "lifted" | null;
  is_past: boolean;
  /** It moves, cancels or corrects dates the source announced earlier. */
  changes_earlier_dates: boolean;
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

const nullable = (description: string) => ({
  type: ["string", "null"],
  description,
});

/** The output schema; the prompt (lib/water-prompt.ts) says how to fill it. */
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "post_type",
    "quality_status",
    "is_past",
    "changes_earlier_dates",
    "items",
  ],
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
        "the interruption started before the publish time (an ongoing failure too)",
    },
    changes_earlier_dates: {
      type: "boolean",
      description:
        "the post moves, cancels or corrects dates the source announced earlier, in an earlier post or an earlier version of this one",
    },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "date",
          "date_verbatim",
          "start",
          "end",
          "locality",
          "locality_verbatim",
          "street",
          "street_verbatim",
          "note",
          "houses",
          "kind",
          "end_estimated",
          "whole_town",
          "whole_town_verbatim",
          "doubt",
          "suggested_places",
        ],
        properties: {
          date: {
            type: "string",
            format: "date",
            description: "the day, YYYY-MM-DD",
          },
          date_verbatim: nullable("exact words of the post giving the day"),
          start: nullable("HH:MM, null if not written"),
          end: nullable("HH:MM, null if not written"),
          locality: nullable("listed locality name, null if not listed"),
          locality_verbatim: nullable(
            "exact words of the post naming the locality",
          ),
          street: nullable("listed street or district name of the locality"),
          street_verbatim: nullable(
            "exact words of the post naming the street or district",
          ),
          note: nullable("the place's limitation, one exact quote"),
          houses: {
            type: "array",
            description: "the note's house numbers",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["from", "to"],
              properties: {
                from: { type: "string" },
                to: { type: ["string", "null"] },
              },
            },
          },
          kind: {
            type: "string",
            enum: ["planned", "emergency", "quality"],
          },
          end_estimated: {
            type: "boolean",
            description: "the end is only expected",
          },
          whole_town: {
            type: "boolean",
            description: "the post says the whole town",
          },
          whole_town_verbatim: nullable("exact words saying the whole town"),
          doubt: nullable(
            "listed district name a bare street name may mean instead",
          ),
          suggested_places: {
            type: "array",
            items: { type: "string" },
            description: "listed names an unlisted place may cover",
          },
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

const isHouse = (v: unknown) => {
  const h = v as Record<string, unknown>;
  return (
    typeof h === "object" &&
    h !== null &&
    typeof h.from === "string" &&
    (h.to === null || typeof h.to === "string")
  );
};

function isItem(v: unknown): v is AiItem {
  const i = v as Record<string, unknown>;
  return (
    typeof i === "object" &&
    i !== null &&
    typeof i.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(i.date) &&
    (i.date_verbatim === null || typeof i.date_verbatim === "string") &&
    isTime(i.start) &&
    isTime(i.end) &&
    orNull(i.locality) &&
    orNull(i.locality_verbatim) &&
    orNull(i.street) &&
    orNull(i.street_verbatim) &&
    orNull(i.note) &&
    Array.isArray(i.houses) &&
    i.houses.every(isHouse) &&
    (i.kind === "planned" || i.kind === "emergency" || i.kind === "quality") &&
    typeof i.end_estimated === "boolean" &&
    typeof i.whole_town === "boolean" &&
    orNull(i.whole_town_verbatim) &&
    orNull(i.doubt) &&
    Array.isArray(i.suggested_places) &&
    i.suggested_places.every(isText)
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
    typeof v.changes_earlier_dates !== "boolean" ||
    !Array.isArray(v.items) ||
    !v.items.every(isItem)
  )
    return null;
  return v as AiResult;
}

/**
 * The model answered, but not in the schema: a failure of that one post
 * (lib/zuk-cron.ts backs off and gives up), never of the model.
 */
export class InvalidReply extends Error {
  /** The reply as given. */
  readonly content: string;

  constructor(content: string) {
    super("xAI: reply is not the schema");
    this.content = content;
  }
}

/** USD at list price, reasoning billed as output. */
export function costUsd(usage: AiUsage): number {
  return (
    usage.promptTokens * PRICE_IN +
    (usage.completionTokens + usage.reasoningTokens) * PRICE_OUT
  );
}

const count = (v: unknown) => (typeof v === "number" ? v : 0);

/** One xAI reply: its content as given, the model, tokens, cost and time. */
export type XaiReply = {
  content: string;
  model: string;
  usage: AiUsage;
  costUsd: number;
  latencyMs: number;
};

/**
 * One chat/completions call to Grok (ZUK_MODEL, ZUK_EFFORT), shared by
 * the water reader and the waste import. The body is exactly what is given:
 * temperature and response_format only when set. Throws on a network or HTTP
 * error or a timeout; never logs the key. No retries.
 */
export async function callXai(
  request: {
    messages: unknown[];
    temperature?: number;
    responseFormat?: unknown;
  },
  apiKey: string,
  fetcher: typeof fetch = fetch,
  timeoutMs: number = TIMEOUT_MS,
): Promise<XaiReply> {
  const started = Date.now();
  const response = await fetcher(XAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ZUK_MODEL,
      reasoning_effort: ZUK_EFFORT,
      temperature: request.temperature,
      messages: request.messages,
      response_format: request.responseFormat,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`xAI: HTTP ${response.status}`);
  const body = (await response.json()) as {
    model?: string;
    usage?: Record<string, unknown>;
    choices?: Array<{ message?: { content?: string } }>;
  };
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
    content: body.choices?.[0]?.message?.content ?? "",
    model: body.model ?? ZUK_MODEL,
    usage,
    costUsd: costUsd(usage),
    latencyMs: Date.now() - started,
  };
}

/**
 * One post read by the model, `system` the source's prompt. Throws on a
 * network or HTTP error or a timeout, InvalidReply on a reply that is not
 * the schema; never logs the key.
 */
export async function readWithAi(
  input: AiInput,
  system: string,
  apiKey: string,
  fetcher: typeof fetch = fetch,
): Promise<AiReading> {
  const reply = await callXai(
    {
      temperature: 0,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Publish date: ${input.published}\nTitle: ${input.title}\n\nText:\n${input.text}`,
        },
      ],
      responseFormat: {
        type: "json_schema",
        json_schema: { name: "zuk", schema: SCHEMA, strict: true },
      },
    },
    apiKey,
    fetcher,
  );
  const result = parseAiResult(reply.content);
  if (!result) throw new InvalidReply(reply.content);
  const { content: _, ...rest } = reply;
  return { result, ...rest };
}
