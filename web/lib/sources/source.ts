// A source of posts the model reads for water notices (lib/zuk-cron.ts).
// Adding one is a folder lib/sources/<id>/: a fetch adapter that returns
// its posts in our shape and a prompt; the schema, the reading, the guards
// and the place gate are shared (lib/zuk-ai.ts, lib/zuk.ts).

import type { ZukPost } from "../zuk.ts";
import type { ZukPlaces } from "../zuk-resolve.ts";

/** The source could not be read: the old file stays. */
export class SourceDown extends Error {}

export type PostSource = {
  /** Stored on each post: "gmina-lubaczow". */
  id: string;
  /** The posts published since `after` (a Warsaw day). Throws SourceDown. */
  fetchPosts: (fetcher: typeof fetch, after: string) => Promise<ZukPost[]>;
  systemPrompt: (places: ZukPlaces) => string;
  /**
   * A keyword guess at a water post: never a gate, only logged where the
   * model disagrees.
   */
  keywords?: (post: ZukPost) => boolean;
};
