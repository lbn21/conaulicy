// The address page's modules: waste, water and the weather today; power and
// others later (docs/tasks T102). Each one has a section on the address
// page (components/hub.tsx), always, in registry order, and a subpage of
// its own, /adres/<id>/<id of the module>, if it has one. The ids and their
// order live in lib/address-routes.ts, so the unit tests and the URL rules
// can read them without Next.js; this registry must list exactly those.
import type { Metadata } from "next";
import type { ComponentType } from "react";
import { WasteDetails, wasteMetadata } from "@/components/place-page";
import { WaterDetails, waterMetadata } from "@/components/water-page";
import { isModuleId, type ModuleId, SUBPAGE_IDS } from "@/lib/address-routes";
import type { Checked, Group, Part } from "@/lib/hub";
import { imgwCopy } from "@/lib/live-store";
import { getPlace, type PlaceView } from "@/lib/schedule";
import type { Item } from "@/lib/upcoming";
import {
  wasteChecked,
  wasteNote,
  wasteSources,
  wasteStatus,
  wasteUpcoming,
} from "@/lib/waste-module";
import { loadWater } from "@/lib/water-load";
import {
  type Water,
  waterChecked,
  waterSources,
  waterStatus,
  waterUpcoming,
} from "@/lib/water-module";
import {
  type Weather,
  weather,
  weatherChecked,
  weatherSources,
  weatherStatus,
  weatherUpcoming,
} from "@/lib/weather-module";

export type Module<D> = {
  id: ModuleId;
  /** Its section's h2. */
  title: string;
  /**
   * `place` is the place id, `nr` a house number. null: no such place
   * (waste: a 404), or nothing we may show (any other: left out).
   */
  load(place: string, nr: string | null): Promise<D | null>;
  /**
   * Its lines for the „Najbliższe dni” block (lib/upcoming.ts), structured:
   * the island words them and hides those over.
   */
  upcoming(data: D): Item[];
  /**
   * Its section's lines, under the h2, always at least one: what is next,
   * or that nothing is (absolute dates only, a first line's day lead the
   * island's; what is next is as of the render, app/adres/[id]/page.tsx).
   */
  status(data: D): Group[];
  /** Its sources, in its section's meta line: a link each. */
  sources(data: D): Part[][];
  /**
   * A sentence in the meta line, after the sources (waste: the dates are
   * not checked yet); left out or null: none.
   */
  note?(data: D): string | null;
  /**
   * When we last checked its source: „Sprawdziliśmy …” at the end of its
   * section's meta line (lib/hub.ts metaLine), and its subpage's checked
   * line (checkedLine). Left out or null: nothing shown.
   */
  checkedAt?(data: D): Checked;
} & (
  | {
      /**
       * Its section's link to the subpage, saying where it goes
       * („Wszystkie odbiory śmieci”), never a bare „Szczegóły”.
       */
      more: string;
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
        checkedAt?: Checked;
      }>;
    }
  | {
      /** No subpage: no link but its source's, in the meta line. */
      Details?: undefined;
    }
);

// Waste wraps today's street page data as it is (PlaceView): a section on
// the address page, and the street page's body on its subpage.
const waste: Module<PlaceView> = {
  id: "smieci",
  title: "Śmieci",
  more: "Wszystkie odbiory śmieci",
  pageTitle: "Odbiór śmieci",
  load: getPlace,
  upcoming: wasteUpcoming,
  status: wasteStatus,
  sources: wasteSources,
  note: wasteNote,
  checkedAt: wasteChecked,
  metadata: wasteMetadata,
  Details: WasteDetails,
};

// The planned water cuts at the address, from each of its sources' files
// (the gmina's posts; in the town MZGKiM's too); no file, or one that
// failed to load: that source's news link.
const woda: Module<Water> = {
  id: "woda",
  title: "Woda",
  more: "Wszystkie przerwy w wodzie",
  pageTitle: "Przerwy w dostawie wody",
  load: loadWater,
  upcoming: waterUpcoming,
  status: waterStatus,
  sources: waterSources,
  checkedAt: waterChecked,
  metadata: waterMetadata,
  Details: WaterDetails,
};

// IMGW's warnings for the powiat (all our gminas lie in one), as the
// banner other pages show, from the same last good copy; no copy yet,
// simply left out; the store unreadable, the same notice as the banner. No
// subpage: its source, linked in the meta line, is IMGW's own page.
const pogoda: Module<Weather> = {
  id: "pogoda",
  title: "Pogoda",
  async load() {
    return weather(await imgwCopy(), Date.now());
  },
  upcoming: weatherUpcoming,
  status: weatherStatus,
  sources: weatherSources,
  checkedAt: weatherChecked,
};

// A module's data type stays its own; the pages only pass it from load()
// to its section and to Details.
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
  return module.Details ? module : null;
}
