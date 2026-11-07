// The address page's URLs: the page itself (/adres/<id>) and one subpage per
// module (/adres/<id>/<module>), each taking a house number as ?nr= (read
// from searchParams: lib/house.ts houseQuery). Pure, so the unit tests,
// proxy.ts and lib/clean-query.ts share one list (lib/modules.ts is the
// registry; it needs Next.js, so it cannot be loaded here).
import { MODULE_IDS, type ModuleId, SUBPAGE_IDS } from "./module-ids.ts";

export { MODULE_IDS, type ModuleId, SUBPAGE_IDS };

/**
 * The subpages app/adres/[id]/[module]/ serves: all but the waste one, which
 * has its own folder (app/adres/[id]/smieci/), so its loading fallback is
 * its own first screen (task 237).
 */
export const MODULE_ROUTE_IDS = SUBPAGE_IDS.filter((id) => id !== "smieci");

/**
 * The address's files, /adres/<id>/<file>: route folders under
 * app/adres/[id]/, which take ?nr= as the subpages do. They win over
 * app/adres/[id]/[module]/, so no module may be called this.
 */
export const FILE_NAMES = ["harmonogram.pdf", "woda.ics"];

export function isModuleId(slug: string): slug is ModuleId {
  return (MODULE_IDS as readonly string[]).includes(slug);
}

const MODULE = `(?:/(?:${SUBPAGE_IDS.join("|")}))?`;

/** /adres/<id> or /adres/<id>/<module>, which take ?nr=. */
export const ADDRESS = new RegExp(`^(/adres/[^/]+${MODULE})/?$`);
