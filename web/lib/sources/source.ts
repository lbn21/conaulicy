// A source of posts the model reads for water notices (lib/zuk-cron.ts).
// Adding one is a folder lib/sources/<id>/: a fetch adapter that returns
// its posts in our shape and a short header for the shared prompt
// (lib/water-prompt.ts), and an entry in lib/water-sources.ts (who it is,
// where it announces cuts, its area, its file); the schema, the reading
// and the place gate are shared (lib/zuk-ai.ts, lib/zuk.ts).

import type { WaterSource } from "../water-sources.ts";
import type { ZukPost } from "../zuk.ts";
import type { ZukPlaces } from "../zuk-resolve.ts";

/** The source could not be read: the old file stays. */
export class SourceDown extends Error {}

export type PostSource = {
  /** Stored on each post: "gmina-lubaczow". */
  id: string;
  /** Who it is to the pages: its name, uid prefix, area and file. */
  water: WaterSource;
  /** The posts published since `after` (a Warsaw day). Throws SourceDown. */
  fetchPosts: (fetcher: typeof fetch, after: string) => Promise<ZukPost[]>;
  systemPrompt: (places: ZukPlaces) => string;
  /**
   * The post in full, fetched right before the model reads it, for a
   * source whose list gives only a summary. Throws if unreadable: the post
   * is retried next run.
   */
  fullPost?: (fetcher: typeof fetch, post: ZukPost) => Promise<ZukPost>;
};
