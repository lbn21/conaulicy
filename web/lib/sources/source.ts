// A source of posts the model reads for water notices (lib/zuk-cron.ts).
// Adding one is a folder lib/sources/<id>/: a fetch adapter that returns
// its posts in our shape and a prompt, and an entry in
// lib/water-sources.ts (who it is, where it announces cuts, its file); the
// schema, the reading, the guards and the place gate are shared
// (lib/zuk-ai.ts, lib/zuk.ts), the gate with the source's own rules.

import type { WaterSource } from "../water-sources.ts";
import type { ZukPost } from "../zuk.ts";
import type { GateRules, ZukPlaces } from "../zuk-resolve.ts";

/** The source could not be read: the old file stays. */
export class SourceDown extends Error {}

export type PostSource = {
  /** Stored on each post: "gmina-lubaczow". */
  id: string;
  /** Who it is to the pages: its name, uid prefix, area and file. */
  water: WaterSource;
  /** The place gate's rules of its own (lib/zuk-resolve.ts); none: the gmina's. */
  gate?: GateRules;
  /** The posts published since `after` (a Warsaw day). Throws SourceDown. */
  fetchPosts: (fetcher: typeof fetch, after: string) => Promise<ZukPost[]>;
  systemPrompt: (places: ZukPlaces) => string;
  /**
   * A keyword guess at a water post: never a gate, only logged where the
   * model disagrees.
   */
  keywords?: (post: ZukPost) => boolean;
  /**
   * A cheap word test run before the model: a post failing it is not about
   * water and never read ("not-water"). None: the model reads every post.
   */
  prefilter?: (post: ZukPost) => boolean;
  /**
   * The post in full, fetched right before the model reads it, for a
   * source whose list gives only a summary. Throws if unreadable: the post
   * is retried next run.
   */
  fullPost?: (fetcher: typeof fetch, post: ZukPost) => Promise<ZukPost>;
};
