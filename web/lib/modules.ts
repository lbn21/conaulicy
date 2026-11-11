// The address page's modules: waste, water, power and the weather. Each one gives the address page
// (components/hub.tsx) its items for the timeline, its notices, its link
// and its check time, in registry order, and has a subpage of its own,
// /adres/<id>/<id of the module>, in one frame (components/module-page.tsx). The ids and their
// order live in lib/address-routes.ts, so the unit tests and the URL rules
// can read them without Next.js; this registry must list exactly those.
import type { ReactNode } from "react";
import { outageDetails } from "@/components/outage-page";
import { indexedPlace, numberError, WasteBody } from "@/components/place-page";
import { OutageRow } from "@/components/rows/outage";
import { WasteRow } from "@/components/rows/smieci";
import { WaterDetails } from "@/components/water-page";
import { isModuleId, type ModuleId, SUBPAGE_IDS } from "@/lib/address-routes";
import type { Checked, Group, Part } from "@/lib/hub";
import { imgwCopy } from "@/lib/live-store";
import { loadPower } from "@/lib/power-load";
import {
  POWER_SUBJECT,
  type Power,
  powerChecked,
  powerDescription,
  powerNotices,
  powerPage,
  powerSources,
  powerUpcoming,
} from "@/lib/power-module";
import { getPlace, type PlaceView } from "@/lib/schedule";
import { placeDescription } from "@/lib/schedule-notes";
import type { Entry } from "@/lib/timeline";
import type { Item } from "@/lib/upcoming";
import { wasteChecked, wasteSources, wasteStatus } from "@/lib/waste-module";
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
  type Weather,
  weather,
  weatherChecked,
  weatherNotices,
} from "@/lib/weather-module";

// Its functions and components are method signatures, so a typed module
// (Module<PlaceView>) is also a Module<unknown> where the pages pass a
// module's own data back to it (components/hub.tsx).
export type Module<D> = {
  id: ModuleId;
  /** Its name in the address page's freshness line: „śmieci”. */
  title: string;
  /**
   * `place` is the place id, `nr` a house number. null: no such place
   * (waste: a 404), or nothing we could read now: the address page and
   * the subpage say it could not be checked (lib/hub.ts unchecked).
   * `imgw`: the weather's preview mock (lib/imgw-preview.ts), outside
   * production only; the others ignore it.
   */
  load(
    place: string,
    nr: string | null,
    imgw?: string | null,
  ): Promise<D | null>;
  /**
   * Its items for the timeline (lib/upcoming.ts, lib/timeline.ts),
   * structured: its Row words them.
   */
  upcoming(data: D): Item[];
  /**
   * The hub's lines that belong to no day, above the timeline:
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
  /**
   * Its row's value on a day: the short summary of entries alike in all
   * but their hours (components/function-rows.tsx rowGroups).
   */
  Row(props: { entries: Entry[] }): ReactNode;
  /** Its sources, in its subpage's inset: a link each. */
  sources(data: D): Part[][];
  /**
   * When we last checked its source: in the address page's freshness line
   * (lib/hub.ts freshnessLine) and its subpage's source inset
   * (sourceLine). null: nothing shown.
   */
  checkedAt(data: D): Checked;
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
  title: "śmieci",
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
  checkedAt: wasteChecked,
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
  title: "woda",
  more: "Wszystkie przerwy w wodzie",
  pageTitle: "Przerwy w dostawie wody",
  load: loadWater,
  upcoming: waterUpcoming,
  notices: waterNotices,
  rowLabel: "Woda",
  hiddenLabel: "o przerwie w dostawie wody",
  subject: "przerw w dostawie wody",
  Row: OutageRow,
  sources: waterSources,
  checkedAt: waterChecked,
  description: waterDescription,
  Details: WaterDetails,
};

// PGE Dystrybucja's outages at the address (lib/power-module.ts), from the
// cron's last good copy: the same row and subpage as the water's
// (components/rows/outage.tsx, components/outage-page.tsx); no copy yet,
// „Nie udało się sprawdzić”; old or unreadable, a notice.
const prad: Module<Power> = {
  id: "prad",
  title: "prąd",
  more: "Wszystkie przerwy w dostawie prądu",
  pageTitle: "Przerwy w dostawie prądu",
  load: loadPower,
  upcoming: powerUpcoming,
  notices: powerNotices,
  rowLabel: "Prąd",
  hiddenLabel: "o przerwie w dostawie prądu",
  subject: POWER_SUBJECT,
  Row: OutageRow,
  sources: powerSources,
  checkedAt: powerChecked,
  description: powerDescription,
  Details: outageDetails(powerPage),
};

// IMGW's warnings for the powiat (all our gminas lie in one), on the
// address page only: a card each above the timeline
// (components/warning-cards.tsx), never in the timeline, and no subpage
// (SUBPAGE_IDS), so no rows, sources or body of its own; no copy yet,
// „Nie udało się sprawdzić”; the store unreadable, a notice.
const pogoda: Module<Weather> = {
  id: "pogoda",
  title: "pogoda",
  more: "Ostrzeżenia pogodowe IMGW",
  pageTitle: "Ostrzeżenia pogodowe IMGW",
  async load(_place, _nr, imgw) {
    return weather(await imgwCopy(imgw), Date.now());
  },
  upcoming: () => [],
  notices: weatherNotices,
  rowLabel: "Ostrzeżenie IMGW",
  hiddenLabel: "o ostrzeżeniu IMGW",
  subject: "ostrzeżeń IMGW",
  Row: () => null,
  sources: () => [],
  checkedAt: weatherChecked,
  description: () => "",
  Details: () => null,
};

// A module's data type stays its own; the pages only pass it from load()
// to its section and to Details.
type ModuleData = {
  smieci: PlaceView;
  woda: Water;
  prad: Power;
  pogoda: Weather;
};
export const MODULES: { [K in ModuleId]: Module<ModuleData[K]> } = {
  smieci: waste,
  woda,
  prad,
  pogoda,
};

/** A module with a subpage, by its slug; null for any other slug. */
export function findSubpage(slug: string): Module<unknown> | null {
  return isModuleId(slug) && SUBPAGE_IDS.includes(slug) ? MODULES[slug] : null;
}
