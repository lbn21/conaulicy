// The address page's modules: waste, water and the weather today; power and
// others later (task 102). Each one gives the address page
// (components/hub.tsx) its items for the timeline, its notices, its link
// and its meta line, in registry order, and has a subpage of its own,
// /adres/<id>/<id of the module>, in one frame (components/module-page.tsx). The ids and their
// order live in lib/address-routes.ts, so the unit tests and the URL rules
// can read them without Next.js; this registry must list exactly those.
import type { ReactNode } from "react";
import { indexedPlace, numberError, WasteBody } from "@/components/place-page";
import { WeatherRow } from "@/components/rows/pogoda";
import { WasteRow } from "@/components/rows/smieci";
import { WaterRow } from "@/components/rows/woda";
import { WaterDetails } from "@/components/water-page";
import { WeatherDetails } from "@/components/weather-page";
import { isModuleId, type ModuleId, SUBPAGE_IDS } from "@/lib/address-routes";
import type { Checked, Group, Part } from "@/lib/hub";
import { imgwCopy } from "@/lib/live-store";
import { getPlace, type PlaceView } from "@/lib/schedule";
import { placeDescription } from "@/lib/schedule-notes";
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
  waterDescription,
  waterNotices,
  waterSources,
  waterUpcoming,
} from "@/lib/water-module";
import {
  POWIAT,
  type Weather,
  weather,
  weatherChecked,
  weatherNotices,
  weatherSources,
  weatherUpcoming,
} from "@/lib/weather-module";

// Its functions and components are method signatures, so a typed module
// (Module<PlaceView>) is also a Module<unknown> where the pages pass a
// module's own data back to it (components/hub.tsx).
export type Module<D> = {
  id: ModuleId;
  /** Its name, before its meta line in „Skąd to wiemy”. */
  title: string;
  /**
   * `place` is the place id, `nr` a house number. null: no such place
   * (waste: a 404), or nothing we could read now: the address page and
   * the subpage say it could not be checked (lib/hub.ts unchecked).
   */
  load(place: string, nr: string | null): Promise<D | null>;
  /**
   * Its items for the timeline (lib/upcoming.ts, lib/timeline.ts),
   * structured: its Row words them.
   */
  upcoming(data: D): Item[];
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
  /** Its sources, in its meta line and its subpage's inset: a link each. */
  sources(data: D): Part[][];
  /**
   * A sentence in the meta line, after the sources (waste: the dates are
   * not checked yet); left out or null: none.
   */
  note?(data: D): string | null;
  /**
   * When we last checked its source: „Sprawdziliśmy …” at the end of its
   * meta line (lib/hub.ts metaLine), and its subpage's checked line
   * (checkedLine). null: nothing shown.
   */
  checkedAt(data: D): Checked;
  /** Before the time in its subpage's checked line: „Wywozy sprawdziliśmy”. */
  checkedLabel: string;
  /**
   * Its link to the subpage in „Wszystko o Twoim adresie”, saying where
   * it goes („Wszystkie odbiory śmieci”), never a bare „Szczegóły”.
   */
  more: string;
  /** The subpage's h1; its title is "<h1> – <place>". */
  pageTitle: string;
  /** The subpage's description, of the place (without its number). */
  description(place: PlaceView): string;
  /**
   * The subpage may be a search result (`missing`: ?nr= came without a
   * usable number); left out: never (its content lasts days).
   */
  indexed?(place: PlaceView, missing: boolean): boolean;
  /**
   * The subpage's error (GOV.UK's summary, „Błąd: ” in its title); left
   * out or null: none.
   */
  error?(place: PlaceView, missing: boolean): string | null;
  /** The subpage's body, under its heading; `error` is Module.error's. */
  Details(props: { data: D; error: string | null }): ReactNode;
};

// Waste wraps today's street page data as it is (PlaceView): its pickups on
// the address page, and the street page's body on its subpage.
const waste: Module<PlaceView> = {
  id: "smieci",
  title: "Śmieci",
  more: "Wszystkie odbiory śmieci",
  pageTitle: "Odbiór śmieci",
  load: getPlace,
  upcoming: wasteUpcoming,
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
  checkedLabel: "Wywozy sprawdziliśmy",
  description: (place) => placeDescription(place, "waste"),
  indexed: indexedPlace,
  error: numberError,
  Details: WasteBody,
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
  notices: waterNotices,
  rowLabel: "Woda",
  hiddenLabel: "o przerwie w dostawie wody",
  subject: "przerw w dostawie wody",
  Row: WaterRow,
  sources: waterSources,
  checkedAt: waterChecked,
  checkedLabel: "Komunikaty o wodzie sprawdziliśmy",
  description: waterDescription,
  Details: WaterDetails,
};

// IMGW's warnings for the powiat (all our gminas lie in one), on the
// address page and its /pogoda subpage only (task 257, task 263): each in
// the timeline, IMGW's own description on /pogoda; no copy yet, „Nie udało
// się sprawdzić”; the store unreadable, a notice.
const pogodaTitle = "Ostrzeżenia pogodowe IMGW";
const pogoda: Module<Weather> = {
  id: "pogoda",
  title: "Pogoda",
  more: pogodaTitle,
  pageTitle: pogodaTitle,
  async load() {
    return weather(await imgwCopy(), Date.now());
  },
  upcoming: weatherUpcoming,
  notices: weatherNotices,
  rowLabel: "Ostrzeżenie IMGW",
  hiddenLabel: "o ostrzeżeniu IMGW",
  subject: "ostrzeżeń IMGW",
  Row: WeatherRow,
  sources: weatherSources,
  checkedAt: weatherChecked,
  checkedLabel: "Ostrzeżenia pogodowe sprawdziliśmy",
  description: (place) => `${pogodaTitle} dla ${POWIAT.of}: ${place.label}.`,
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
export function findSubpage(slug: string): Module<unknown> | null {
  return isModuleId(slug) && SUBPAGE_IDS.includes(slug) ? MODULES[slug] : null;
}
