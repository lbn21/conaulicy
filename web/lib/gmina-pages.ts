import "server-only";
import { todayInWarsaw } from "@/lib/dates";
import {
  builtOf,
  type GminaPower,
  type GminaWater,
  gminaPower,
  gminaWater,
  powerPlaces,
  waterPlaces,
} from "@/lib/gmina-outages";
import { type PageDef, SOURCE_TAGS } from "@/lib/page-cache";
import { placeParams } from "@/lib/schedule";
import { GMINA_OUTAGE_PATH } from "@/lib/static-pages";

// The gmina-wide outage pages' PageDefs (lib/page-cache.ts), /woda and
// /prad (lib/gmina-outages.ts), with no component imported, as
// lib/data-pages.ts. Each reads the dataset (the places' links depend on
// the place set this deployment built) and its live source, and keeps only
// what it renders: the Warsaw day („Dziś”, „Jutro”), the ids it links and
// the outages, no check time, so a check that changes nothing changes no
// digest (lib/page-refresh.ts). The registry of every page: lib/pages.ts.

/** What a gmina-wide outage page renders. */
export type GminaView<D> = {
  /** The Warsaw day it is rendered for (components/page-day.tsx). */
  today: string;
  /** The ids of its places this deployment built: its links. */
  built: string[];
  data: D;
};

/** The ids of the build's place set. */
const builtIds = async () => new Set((await placeParams()).map(({ id }) => id));

export const gminaWaterDef: PageDef<GminaView<GminaWater>> = {
  path: GMINA_OUTAGE_PATH.woda,
  sources: [SOURCE_TAGS.dataset, SOURCE_TAGS.water],
  async load(reads) {
    const [ids, views] = await Promise.all([builtIds(), reads.water()]);
    const data = gminaWater(views);
    return {
      today: todayInWarsaw(new Date(reads.now)),
      built: builtOf(waterPlaces(data), ids),
      data,
    };
  },
};

export const gminaPowerDef: PageDef<GminaView<GminaPower | null>> = {
  path: GMINA_OUTAGE_PATH.prad,
  sources: [SOURCE_TAGS.dataset, SOURCE_TAGS.pge],
  async load(reads) {
    const [ids, copy] = await Promise.all([builtIds(), reads.pge()]);
    const data = gminaPower(copy, reads.now);
    return {
      today: todayInWarsaw(new Date(reads.now)),
      built: builtOf(powerPlaces(data), ids),
      data,
    };
  },
};
