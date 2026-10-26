// MZGKiM Lubaczów's komunikaty (https://mzgkim.lubaczow.pl): the town's
// water cuts among its other posts (the PSZOK, opening hours, deratyzacja).

import { MZGKIM } from "../../water-sources.ts";
import { fullText, type ZukPost } from "../../zuk.ts";
import type { PostSource } from "../source.ts";
import { fetchPosts, fullPost } from "./fetch.ts";
import { systemPrompt } from "./prompt.ts";

/** The town (TERYT SIMC): every MZGKiM post concerns it. */
export const TOWN_ID = "0972447";

/** Water, as a word of its own: "wody", "wodę", "wodociągowej". */
const WATER = /(?<!\p{L})wod(?:a|y|ę|ą|zie|oci\p{L}*)(?!\p{L})/iu;

/**
 * Before the model: a post with no water word in its title or summary is
 * not about water (the PSZOK, opening hours, deratyzacja).
 */
export const aboutWater = (post: ZukPost) => WATER.test(fullText(post));

export const mzgkim: PostSource = {
  id: "mzgkim",
  water: MZGKIM,
  gate: {
    area: TOWN_ID,
    whole: /cał\p{L}*\s+(?:miast|mieś|mies)\p{L}*/iu,
    declined: true,
  },
  fetchPosts,
  systemPrompt,
  prefilter: aboutWater,
  fullPost,
};
