// Grok reads one ZUK post (xAI chat/completions, structured output). What it
// returns is a claim, not a fact: lib/zuk-guards.ts checks every value
// against the post's own text and lib/zuk-resolve.ts maps the places to
// ours; anything that fails stays a Notice. Prompt and schema scored
// 116/117 items on 23 real notices (25 Oct 2026, reasoning low, temp. 0).

export const ZUK_MODEL = "grok-4.7";

const XAI_URL = "https://api.x.ai/v1/chat/completions";
const TIMEOUT_MS = 60_000;
// USD per token, list price; reasoning tokens are billed as output.
const PRICE_IN = 2 / 1_000_000;
const PRICE_OUT = 6 / 1_000_000;

export type AiItem = {
  /** YYYY-MM-DD, the day the cut starts. */
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
  kind: "planned" | "emergency";
};

export type AiResult = {
  is_outage_notice: boolean;
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
  required: ["is_outage_notice", "is_past", "items"],
  properties: {
    is_outage_notice: {
      type: "boolean",
      description:
        "true only if the post announces or reports a water supply interruption",
    },
    is_past: {
      type: "boolean",
      description:
        "true if the text reports an interruption that already happened (past tense, e.g. 'nastąpiła'), not one announced for the future",
    },
    items: {
      type: "array",
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
          kind: { type: "string", enum: ["planned", "emergency"] },
        },
      },
    },
  },
};

const SYSTEM = `You extract water supply interruptions from Polish notices by ZUK Mokrzyca (gmina Lubaczów).
Rules:
- One item per (day, locality, street). If a locality lists several streets, emit one item per street, repeating the locality.
- A multi-day notice gets one item per day per place. A night span (e.g. 'w nocy z 21.12 na 22.12, 22:00-5:00') is ONE item dated on the first day, start 22:00, end 05:00.
- 'ul.'/'ulica' after a comma belongs to the locality before it: 'Młodów, ul. Pilipy' = locality Młodów, street Pilipy. Never drop a street, house range or 'w części' qualifier.
- place_verbatim is copied exactly from the text, the shortest phrase that contains the locality and this item's street, plus its house numbers, '(przysiółek …)' or other bracket if any: 'Młodów – ul. Warszawska, Rzeczna' for the street Rzeczna, 'ul. Przemysłowa (Lubaczów)', 'w części miejscowości Bałaje'.
- note: a qualifier that narrows the place ('w części miejscowości', 'gospodarstwa zasilane z SUW Mokrzyca'), copied exactly; otherwise null.
- Copy locality and street verbatim from the text (keep Polish diacritics). Never add places, dates or times that are not in the text. If something is unclear, leave it out.
- kind is 'emergency' for a failure (awaria), else 'planned'. For an estimated restore ('przewidywane wznowienie do godz. 19.00') use that time as end.
- Use the publish date only to resolve a year if missing. Do not guess.
- Posts that are not about water interruptions: is_outage_notice=false, items=[].`;

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
    (i.kind === "planned" || i.kind === "emergency")
  );
}

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
    typeof v.is_outage_notice !== "boolean" ||
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
 * One post read by the model. Throws on a network or HTTP error, a timeout
 * or a reply that is not the schema; never logs the key.
 */
export async function readWithAi(
  input: AiInput,
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
        { role: "system", content: SYSTEM },
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
