// The address page's modules: waste, water, power and the weather. Each one gives the address page
// (components/hub.tsx) its items for the timeline, its notices, its link
// and its check time, in registry order, and has a subpage of its own,
// /adres/<id>/<id of the module>, in one frame (components/module-page.tsx). The ids and their
// order live in lib/address-routes.ts, so the unit tests can read them
// without Next.js; this registry must list exactly those.
import type { ReactNode } from "react";
import { outageDetails } from "@/components/outage-page";
import { indexedPlace, WasteBody } from "@/components/place-page";
import { OutageRow } from "@/components/rows/outage";
import { WasteRow } from "@/components/rows/smieci";
import { WaterDetails } from "@/components/water-page";
import { isModuleId, type ModuleId, SUBPAGE_IDS } from "@/lib/address-routes";
import type { Cadence } from "@/lib/cadence";
import type { Group, Part } from "@/lib/hub";
import type { LiveReads } from "@/lib/live-reads";
import { SOURCE_TAGS, type SourceTag } from "@/lib/page-cache";
import { loadPower } from "@/lib/power-load";
import {
  POWER_SUBJECT,
  type Power,
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
import { wasteSources, wasteStatus } from "@/lib/waste-module";
import { wasteUpcoming } from "@/lib/waste-upcoming";
import { loadWater } from "@/lib/water-load";
import {
  type Water,
  waterDescription,
  waterNotices,
  waterSources,
  waterUpcoming,
} from "@/lib/water-module";
import { type Weather, weather, weatherNotices } from "@/lib/weather-module";

// Its functions and components are method signatures, so a typed module
// (Module<PlaceView>) is also a Module<unknown> where the pages pass a
// module's own data back to it (components/hub.tsx).
export type Module<D> = {
  id: ModuleId;
  /** Its name in the address page's freshness line: „woda”. */
  title: string;
  /** The sources load() reads: its pages' tags (lib/page-cache.ts). */
  tags: SourceTag[];
  /**
   * `place` is the place id. null: no such place (waste: a 404), or
   * nothing we could read now: the address page and the subpage say it
   * could not be checked (lib/hub.ts unchecked).
   */
  load(place: string, reads: LiveReads): Promise<D | null>;
  /**
   * Its items for the timeline (lib/upcoming.ts, lib/timeline.ts),
   * structured: its Row words them.
   */
  upcoming(data: D): Item[];
  /**
   * The hub's lines that belong to no day, above the timeline: no
   * schedule, a source we could not check, posts we could not read.
   * Usually none.
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
   * When its source's data last changed (ms), a live source's only (the
   * cron writes it when the content changes): the address page's and its
   * subpage's freshness line (lib/hub.ts freshnessLine). null: none shown
   * (the waste schedule: its source line only).
   */
  changedAt(data: D): number | null;
  /** How often its source is checked (lib/cadence.ts); null: never. */
  cadence: Cadence | null;
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
   * The subpage may be a search result; left out: never (its content
   * lasts days).
   */
  indexed?(place: PlaceView): boolean;
  /** The subpage's body, under its heading. */
  Details(props: { data: D }): ReactNode;
};

// Waste wraps today's street page data as it is (PlaceView): its pickups on
// the address page, and the street page's body on its subpage.
const waste: Module<PlaceView> = {
  id: "smieci",
  title: "śmieci",
  tags: [SOURCE_TAGS.dataset],
  more: "Wszystkie odbiory śmieci",
  pageTitle: "Odbiór śmieci",
  load: (id, reads) => getPlace(id, reads.now),
  upcoming: wasteUpcoming,
  notices: (place) =>
    place.zoneId === null || !place.days.some((day) => day.date >= place.today)
      ? wasteStatus(place)
      : [],
  rowLabel: "Śmieci",
  hiddenLabel: "o odbiorze śmieci",
  subject: "odbiorów śmieci",
  Row: WasteRow,
  sources: wasteSources,
  changedAt: () => null,
  cadence: null,
  description: (place) => placeDescription(place, "waste"),
  indexed: indexedPlace,
  Details: WasteBody,
};

// The planned water cuts at the address, from each of its sources' files
// (the gmina's posts; in the town MZGKiM's too); no file, or one that
// failed to load: that source's news link.
const woda: Module<Water> = {
  id: "woda",
  title: "woda",
  tags: [SOURCE_TAGS.dataset, SOURCE_TAGS.water],
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
  changedAt: (data) => data.changedAt,
  cadence: "water",
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
  tags: [SOURCE_TAGS.dataset, SOURCE_TAGS.pge],
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
  changedAt: (data) => data.changedAt,
  cadence: "live",
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
  tags: [SOURCE_TAGS.imgw],
  more: "Ostrzeżenia pogodowe IMGW",
  pageTitle: "Ostrzeżenia pogodowe IMGW",
  async load(_place, reads) {
    return weather(await reads.imgw(), reads.now);
  },
  upcoming: () => [],
  notices: weatherNotices,
  rowLabel: "Ostrzeżenie IMGW",
  hiddenLabel: "o ostrzeżeniu IMGW",
  subject: "ostrzeżeń IMGW",
  Row: () => null,
  sources: () => [],
  changedAt: (data) => data.changedAt,
  cadence: "live",
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
