// The gmina Lubaczów's site (https://www.gminalubaczow.pl): ZUK Mokrzyca's
// and the wójt's water notices among the gmina's other posts.

import { GMINA } from "../../water-sources.ts";
import { fullText, type ZukPost } from "../../zuk.ts";
import type { PostSource } from "../source.ts";
import { fetchPosts } from "./fetch.ts";
import { systemPrompt } from "./prompt.ts";

const OUTAGE =
  /przerw\p{L}*\s+w\s+dostaw\p{L}*\s+wody|brak\p{L}*\s+wody|wyłącz\p{L}*\s+wody|awari\p{L}*\s+(?:sieci\s+)?wodoci\p{L}*/iu;
const SOURCE =
  /Zakład\p{L}*\s+Usług\s+Komunalnych|Mokrzyc|Wójt\p{L}*\s+Gminy/iu;

/**
 * The old keyword filter (task 113): an outage phrase and its source (ZUK
 * or the wójt). Never a gate now, the model's post_type decides; only a
 * cross-check, logged when the two disagree (lib/zuk-cron.ts).
 */
export function matchesOutageKeywords(post: ZukPost): boolean {
  const all = fullText(post);
  return OUTAGE.test(all) && SOURCE.test(all);
}

export const gminaLubaczow: PostSource = {
  id: "gmina-lubaczow",
  water: GMINA,
  fetchPosts,
  systemPrompt,
  keywords: matchesOutageKeywords,
};
