// One post through the model and the gate exactly as the water cron reads
// it (lib/zuk-cron.ts), with no write anywhere: the source's prompt with
// our places (the TERYT snapshot and the gazetteer), the model's JSON, then
// readPost or readQualityPost for the source. For a real dry run
// on Jakub's box (scripts/water-dry-run.ts); `ai` given, no model call.
import type { PostSource } from "../../lib/sources/source.ts";
import {
  type PostReading,
  plainText,
  type QualityReading,
  readPost,
  readQualityPost,
  type ZukPost,
} from "../../lib/zuk.ts";
import type { AiReading, AiResult, readWithAi } from "../../lib/zuk-ai.ts";
import type { ZukPlaces } from "../../lib/zuk-resolve.ts";

export type DryRun = {
  source: string;
  /** The system prompt's size, to compare runs. */
  promptChars: number;
  /** The model's reading (its usage and cost too, if it was called). */
  model: AiResult;
  call: Omit<AiReading, "result"> | null;
  gate: PostReading | QualityReading;
};

export async function waterDryRun(args: {
  post: ZukPost;
  source: PostSource;
  places: ZukPlaces;
  /** The model's JSON as given: no call. */
  ai?: AiResult;
  readAi?: typeof readWithAi;
  xaiKey?: string;
  checkedAt?: string;
}): Promise<DryRun> {
  const { post, source, places } = args;
  const system = source.systemPrompt(places);
  let model = args.ai;
  let call: DryRun["call"] = null;
  if (!model) {
    if (!args.readAi || !args.xaiKey)
      throw new Error("No model reading given and no XAI_API_KEY to read it.");
    const { result, ...rest } = await args.readAi(
      {
        published: post.date,
        title: plainText(post.title.rendered),
        text: plainText(post.content.rendered),
      },
      system,
      args.xaiKey,
    );
    model = result;
    call = rest;
  }
  const rules = { source: source.water };
  const gate =
    model.post_type === "water_quality"
      ? readQualityPost(post, model, places, rules)
      : readPost(
          post,
          model,
          places,
          args.checkedAt ?? new Date().toISOString(),
          rules,
        );
  return {
    source: source.id,
    promptChars: system.length,
    model,
    call,
    gate,
  };
}
