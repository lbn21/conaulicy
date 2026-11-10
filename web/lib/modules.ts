// The address page's modules: waste, water and the weather today; power and
// others later (task 102). Each one has a section on the address
// page (components/hub.tsx), always, in registry order, and a subpage of
// its own, /adres/<id>/<id of the module>, if it has one. The ids and their
// order live in lib/address-routes.ts, so the unit tests and the URL rules
// can read them without Next.js; this registry must list exactly those.
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { WasteDetails, wasteMetadata } from "@/components/place-page";
import { WeatherRow } from "@/components/rows/pogoda";
import { WasteRow } from "@/components/rows/smieci";
import { WaterRow } from "@/components/rows/woda";
import { WasteStatus } from "@/components/waste-status";
import { WaterDetails, waterMetadata } from "@/components/water-page";
import { WeatherDetails, weatherMetadata } from "@/components/weather-page";
import { isModuleId, type ModuleId, SUBPAGE_IDS } from "@/lib/address-routes";
import type { Checked, Group, Part } from "@/lib/hub";
import { imgwCopy } from "@/lib/live-store";
import { getPlace, type PlaceView } from "@/lib/schedule";
import type { Entry } from "@/lib/timeline";
import type { Item } from "@/lib/upcoming";
import {
  wasteChecked,
  wasteNote,
  wasteSources,
  wasteStatus,
} from "@/lib/waste-module";
import { wasteUpcoming } from "@/lib/waste-upcoming";
import { loadWater } from "@/lib/water-load";
import {
  type Water,
  waterChecked,
  waterNotices,
  waterSources,
  waterStatus,
  waterUpcoming,
} from "@/lib/water-module";
import {
  type Weather,
  weather,
  weatherChecked,
  weatherNotices,
  weatherSources,
  weatherStatus,
  weatherUpcoming,
} from "@/lib/weather-module";

// Its functions and components are method signatures, so a typed module
// (Module<PlaceView>) is also a Module<unknown> where the pages pass a
// module's own data back to it (components/hub.tsx).
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
   * Its data changes between imports (a cron's file). Every address page
   * reads all its modules per request (task 239); a live module with no
   * data yet says it has not been checked (components/hub.tsx).
   */
  live?: boolean;
  /**
   * Its lines for the „Najbliższe dni” block (lib/upcoming.ts), structured:
   * the island words them and hides those over.
   */
  upcoming(data: D): Item[];
  /**
   * Its section's lines, under the h2: only what „Najbliższe dni” does not
   * say (task 257). Waste: what is next, or that nothing is (absolute
   * dates only, a first line's day lead the island's). Water and weather
   * never list their cuts or warnings again: none at all is possible for
   * water, whose link and sources follow.
   */
  status(data: D): Group[];
  /**
   * The hub's lines that belong to no day (task 263), above the timeline:
   * the split street's question, no schedule, a source we could not
   * check, posts we could not read. Usually none.
   */
  notices(data: D): Group[];
  /** Its row's key in a timeline card: „Śmieci”, „Ostrzeżenie IMGW”. */
  rowLabel: string;
  /** After „Szczegóły”, for screen readers only: „o odbiorze śmieci”. */
  hiddenLabel: string;
  /** After „Nie udało się sprawdzić”: „przerw w dostawie wody”. */
  subject: string;
  /** Its row's value on a day: the short summary. */
  Row(props: { entry: Entry }): ReactNode;
  /**
   * Its section's lines drawn on the device instead of status() as of the
   * render (a Client Component): waste, whose next pickup moves on with the
   * day while the shell is cached.
   */
  Status?(props: { data: D }): ReactNode;
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
      Details(props: {
        data: D;
        missing?: boolean;
        checkedAt?: Checked;
      }): ReactNode;
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
  Status: WasteStatus,
  notices: (place) =>
    place.askNumber ||
    place.zoneId === null ||
    !place.days.some((day) => day.date >= place.today)
      ? wasteStatus(place)
      : [],
  rowLabel: "Śmieci",
  hiddenLabel: "o odbiorze śmieci",
  subject: "odbiorów śmieci",
  Row: WasteRow,
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
  live: true,
  upcoming: waterUpcoming,
  status: waterStatus,
  notices: waterNotices,
  rowLabel: "Woda",
  hiddenLabel: "o przerwie w dostawie wody",
  subject: "przerw w dostawie wody",
  Row: WaterRow,
  sources: waterSources,
  checkedAt: waterChecked,
  metadata: waterMetadata,
  Details: WaterDetails,
};

// IMGW's warnings for the powiat (all our gminas lie in one), shown only
// on the address page (task 257): each in „Najbliższe dni”, IMGW's own
// description in its section; no copy yet, „Jeszcze tego nie
// sprawdziliśmy”; the store unreadable, a notice. No subpage: its source,
// linked in the meta line, is IMGW's own page.
const pogoda: Module<Weather> = {
  id: "pogoda",
  title: "Pogoda",
  more: "Ostrzeżenia pogodowe IMGW",
  pageTitle: "Ostrzeżenia pogodowe IMGW",
  async load() {
    return weather(await imgwCopy(), Date.now());
  },
  live: true,
  upcoming: weatherUpcoming,
  status: weatherStatus,
  notices: weatherNotices,
  rowLabel: "Ostrzeżenie IMGW",
  hiddenLabel: "o ostrzeżeniu IMGW",
  subject: "ostrzeżeń IMGW",
  Row: WeatherRow,
  sources: weatherSources,
  checkedAt: weatherChecked,
  metadata: weatherMetadata,
  Details: WeatherDetails,
};

// A module's data type stays its own; the pages only pass it from load()
// to its section and to Details.
type ModuleData = { smieci: PlaceView; woda: Water; pogoda: Weather };
export const MODULES: { [K in ModuleId]: Module<ModuleData[K]> } = {
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
