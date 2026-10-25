// The address page's modules: waste today; water, power and others later
// (docs/tasks T102). Each module has its own subpage, /adres/<id>/<id of the
// module>, and later one card on the address page. The ids and their order
// live in lib/address-routes.ts, so the unit tests and the URL rules can read
// them without Next.js; this registry must list exactly those.
import type { ComponentType } from "react";
import { WasteDetails } from "@/components/place-page";
import { isModuleId, MODULE_IDS, type ModuleId } from "@/lib/address-routes";
import { getPlace, type PlaceView } from "@/lib/schedule";
import {
  type ModuleStatus,
  type SummaryRow,
  wasteStatus,
  wasteSummary,
} from "@/lib/waste-module";

/** Something for today or tomorrow, shown above everything else. */
type Alert = { text: string; short: string; linkText: string };

type Module<D> = {
  /** The subpage slug. */
  id: ModuleId;
  title: string;
  /** The subpage's h1. */
  pageTitle: string;
  /** Registry order, from 0. */
  order: number;
  /** null: no such place. `place` is the place id, `nr` a house number. */
  load(place: string, nr: string | null): Promise<D | null>;
  alert(data: D): Alert | null;
  /** null: nothing to show ("Bez zapowiedzi"). */
  summary(data: D): SummaryRow[] | null;
  status(data: D): ModuleStatus;
  /** The subpage body. `missing`: ?nr= came without a usable number. */
  Details: ComponentType<{ data: D; missing?: boolean }>;
};

// Waste wraps today's street page as it is: PlaceView, PlaceMain's body.
const waste: Module<PlaceView> = {
  id: "smieci",
  title: "Śmieci",
  pageTitle: "Odbiór śmieci",
  order: MODULE_IDS.indexOf("smieci"),
  load: getPlace,
  // A pickup is routine, never a warning.
  alert: () => null,
  summary: wasteSummary,
  status: wasteStatus,
  Details: WasteDetails,
};

// A module's data type stays its own; the pages only pass it from load()
// to Details.
// biome-ignore lint/suspicious/noExplicitAny: one registry for every data type
const MODULES: { [K in ModuleId]: Module<any> } = { smieci: waste };

export function findModule(slug: string): Module<unknown> | null {
  return isModuleId(slug) ? MODULES[slug] : null;
}
