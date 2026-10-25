// The address page's modules: waste, water and the weather today; power and
// others later (docs/tasks T102). Each one has a card on the address page
// (components/hub.tsx), or a line under „Bez zapowiedzi” when it has nothing
// to show, and a subpage of its own, /adres/<id>/<id of the module>, if it
// has one. The ids and their order live in lib/address-routes.ts, so the
// unit tests and the URL rules can read them without Next.js; this registry
// must list exactly those.
import type { Metadata } from "next";
import type { ComponentType } from "react";
import { imgwCopy } from "@/components/imgw-banner";
import { WasteDetails, wasteMetadata } from "@/components/place-page";
import { WaterDetails, waterMetadata } from "@/components/water-page";
import {
  isModuleId,
  MODULE_IDS,
  type ModuleId,
  SUBPAGE_IDS,
} from "@/lib/address-routes";
import type { Alert, Part, SummaryRow } from "@/lib/hub";
import { IMGW_PAGE } from "@/lib/imgw-banner";
import { getPlace, type PlaceView } from "@/lib/schedule";
import { wasteSources, wasteSummary } from "@/lib/waste-module";
import {
  type Water,
  water,
  waterAlerts,
  waterChecked,
  waterNone,
  waterSources,
  waterSummary,
} from "@/lib/water-module";
import {
  type Weather,
  weather,
  weatherAlerts,
  weatherSources,
  weatherSummary,
} from "@/lib/weather-module";
import { getZukData } from "@/lib/zuk-store";

export type Module<D> = {
  id: ModuleId;
  /** The card's title. */
  title: string;
  /** Registry order, from 0. */
  order: number;
  /**
   * `place` is the place id, `nr` a house number. null: no such place
   * (waste: a 404), or nothing we may show (any other: left out).
   */
  load(place: string, nr: string | null): Promise<D | null>;
  /** Today's and the coming warnings, for the slot above the cards. */
  alerts(data: D): Alert[];
  /** The card's rows; null: nothing to show („Bez zapowiedzi”). */
  summary(data: D): SummaryRow[] | null;
  /** What „Bez zapowiedzi” says for it, after its title (summary null). */
  none?: string | ((data: D) => string);
  /** Its sources, one „Źródło” each: a link and when it was checked. */
  sources(data: D): Part[][];
  /**
   * When we last checked its source: „Ostatnio sprawdziliśmy …” on its card,
   * its „Bez zapowiedzi” line and its subpage (lib/hub.ts checkedLine).
   * Left out or null: nothing shown.
   */
  checkedAt?(data: D): Date | null;
} & (
  | {
      /** The subpage's h1. */
      pageTitle: string;
      /** The subpage's title, description and canonical (its own URL). */
      metadata(
        id: string,
        nr: string | null,
        missing: boolean,
      ): Promise<Metadata>;
      /**
       * The subpage body. `missing`: ?nr= came without a usable number;
       * `checkedAt`: the module's, for its heading.
       */
      Details: ComponentType<{
        data: D;
        missing?: boolean;
        checkedAt?: Date | null;
      }>;
    }
  | {
      /** No subpage: „Szczegóły” goes to the source's own page. */
      href: string;
    }
);

// Waste wraps today's street page data as it is (PlaceView): a card on the
// address page, and the street page's body on its subpage.
const waste: Module<PlaceView> = {
  id: "smieci",
  title: "Śmieci",
  pageTitle: "Odbiór śmieci",
  order: MODULE_IDS.indexOf("smieci"),
  load: getPlace,
  // A pickup is routine, never a warning.
  alerts: () => [],
  summary: wasteSummary,
  sources: wasteSources,
  metadata: wasteMetadata,
  Details: WasteDetails,
};

// ZUK's planned water cuts at the address, from the ZUK file; no file, or
// one that failed to load: the gmina's news link only.
const woda: Module<Water> = {
  id: "woda",
  title: "Woda",
  pageTitle: "Przerwy w dostawie wody",
  order: MODULE_IDS.indexOf("woda"),
  async load(id, nr) {
    const [place, view] = await Promise.all([getPlace(id, nr), getZukData()]);
    return place && water(view, place);
  },
  alerts: waterAlerts,
  summary: waterSummary,
  none: waterNone,
  sources: waterSources,
  checkedAt: waterChecked,
  metadata: waterMetadata,
  Details: WaterDetails,
};

// IMGW's warnings for the powiat (all our gminas lie in one), as the
// banner other pages show; failing or too old, simply left out.
const pogoda: Module<Weather> = {
  id: "pogoda",
  title: "Pogoda",
  order: MODULE_IDS.indexOf("pogoda"),
  async load() {
    const now = Date.now();
    try {
      return weather(await imgwCopy(now), now);
    } catch (error) {
      console.warn(`IMGW: not shown (${(error as Error).message})`);
      return null;
    }
  },
  alerts: weatherAlerts,
  summary: weatherSummary,
  none: "brak ostrzeżeń IMGW",
  sources: weatherSources,
  href: IMGW_PAGE,
};

// A module's data type stays its own; the pages only pass it from load()
// to the card and to Details.
// biome-ignore lint/suspicious/noExplicitAny: one registry for every data type
export const MODULES: { [K in ModuleId]: Module<any> } = {
  smieci: waste,
  woda,
  pogoda,
};

/** A module with a subpage, by its slug; null for any other slug. */
export function findSubpage(slug: string) {
  if (!isModuleId(slug) || !SUBPAGE_IDS.includes(slug)) return null;
  const module: Module<unknown> = MODULES[slug];
  return "Details" in module ? module : null;
}
