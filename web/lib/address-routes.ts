// The address page's URLs: the page itself (/adres/<id>), one subpage per
// module (/adres/<id>/<module>) and its files. Pure, so the unit tests
// share one list (lib/modules.ts is the registry; it needs Next.js, so it
// cannot be loaded here).
import { MODULE_IDS, type ModuleId, SUBPAGE_IDS } from "./module-ids.ts";

export { MODULE_IDS, type ModuleId, SUBPAGE_IDS };

/**
 * The address's files, /adres/<id>/<file>: route folders under
 * app/adres/[id]/, beside each subpage's own folder, so no module may be
 * called this.
 */
export const FILE_NAMES = ["harmonogram.pdf", "woda.ics"];

export function isModuleId(slug: string): slug is ModuleId {
  return (MODULE_IDS as readonly string[]).includes(slug);
}
