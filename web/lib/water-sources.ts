// Who announces water cuts, and where: one entry per source the water
// cron reads (lib/sources/<id>, lib/zuk-cron.ts). Pure, for the cron and
// the pages alike. The pages' logic and texts are one for every address
// (lib/water-module.ts); only an address's list of sources differs: the
// gmina's posts (ZUK, the wójt) everywhere, MZGKiM's in the town
// and its parts, where MZGKiM supplies most of the water.

import type { Part } from "./hub.ts";
import { ZUK_PLACES } from "./zuk-places.generated.ts";

export type WaterSourceId = "gmina-lubaczow" | "mzgkim";

export type WaterSource = {
  id: WaterSourceId;
  /** Its cuts' and notices' uid prefix: "zuk-12345-…" (lib/zuk.ts). */
  uid: string;
  /** In each cut's source (the hard rule): who announced it. */
  name: string;
  /** After an alert: its short name. */
  short: string;
  /** The file in the private Blob store (lib/zuk-store.ts). */
  pathname: string;
  /** The localities it reads posts for; null: every one of ours. */
  area: ReadonlySet<string> | null;
  /** The locality its posts concern without naming it; null: none. */
  implied: string | null;
  /** Who, as a sentence starts: "Gmina", "MZGKiM"; and inside one. */
  who: string;
  inline: string;
  /** Its verbs: "ogłosiła" or "ogłosił", "zapowiedziała" or "zapowiedział". */
  announced: string;
  foretold: string;
  /** Whose posts, after „komunikatu”: "gminy", "MZGKiM". */
  of: string;
  /** Its posts' page, as „Źródło” names it: "aktualności gminy …". */
  news: Part;
  /** The same after „do”: "aktualności gminy …", "komunikatów MZGKiM". */
  newsOf: Part;
  /** Where it announces cuts, as a sentence: "Gmina ogłasza je w …". */
  announces: Part[];
  /** The same after the first source's: "MZGKiM – w …". */
  announcesToo: Part[];
};

/** The gmina's news: where its water posts appear. */
export const GMINA_NEWS = "https://www.gminalubaczow.pl/aktualnosci/";
const gminaNews = { href: GMINA_NEWS, text: "aktualności gminy Lubaczów" };

/** MZGKiM's posts: where the town's water cuts appear. */
export const MZGKIM_NEWS = "https://mzgkim.lubaczow.pl/category/komunikaty/";

/** The town and its parts, from TERYT: MZGKiM's area. */
const TOWNS = new Set(
  ZUK_PLACES.localities.filter((l) => l.kind === "miasto").map((l) => l.id),
);
/** The town (TERYT SIMC): every MZGKiM post concerns it, never naming it. */
const [TOWN_ID] = TOWNS;
export const TOWN: ReadonlySet<string> = new Set(
  ZUK_PLACES.localities
    .filter((l) => TOWNS.has(l.id) || TOWNS.has(l.parentId ?? ""))
    .map((l) => l.id),
);

export const GMINA: WaterSource = {
  id: "gmina-lubaczow",
  uid: "zuk",
  name: "Zakład Usług Komunalnych w Mokrzycy",
  short: "ZUK Mokrzyca",
  pathname: "zuk/disruptions.json",
  area: null,
  implied: null,
  who: "Gmina",
  inline: "gmina",
  announced: "ogłosiła",
  foretold: "zapowiedziała",
  of: "gminy",
  news: gminaNews,
  newsOf: gminaNews,
  announces: ["Gmina ogłasza je w ", gminaNews],
  announcesToo: ["gmina – w ", gminaNews],
};

export const MZGKIM: WaterSource = {
  id: "mzgkim",
  uid: "mzgkim",
  name: "Miejski Zakład Gospodarki Komunalnej i Mieszkaniowej w Lubaczowie",
  short: "MZGKiM",
  pathname: "mzgkim/disruptions.json",
  area: TOWN,
  implied: TOWN_ID,
  who: "MZGKiM",
  inline: "MZGKiM",
  announced: "ogłosił",
  foretold: "zapowiedział",
  of: "MZGKiM",
  news: { href: MZGKIM_NEWS, text: "komunikaty MZGKiM" },
  newsOf: { href: MZGKIM_NEWS, text: "komunikatów MZGKiM" },
  announces: [
    "MZGKiM ogłasza je w ",
    { href: MZGKIM_NEWS, text: "komunikatach MZGKiM" },
  ],
  announcesToo: [
    "MZGKiM – w ",
    { href: MZGKIM_NEWS, text: "komunikatach MZGKiM" },
  ],
};

/** Every source, in the order the pages name them. */
export const WATER_SOURCES: readonly WaterSource[] = [GMINA, MZGKIM];

/** The sources that announce cuts at a locality, in that order. */
export const sourcesAt = (localityId: string): WaterSource[] =>
  WATER_SOURCES.filter((s) => s.area === null || s.area.has(localityId));

/** A cut's or notice's source, by its uid's prefix; the gmina's if none. */
export const sourceOf = (uid: string): WaterSource =>
  WATER_SOURCES.find((s) => uid.startsWith(`${s.uid}-`)) ?? GMINA;
