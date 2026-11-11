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
 * its own first screen.
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

/** /api/places: every place's id, and renamed ones' old id → new id. */
export type PlacesMap = { ids: string[]; moved: Record<string, string> };

/** /adres/<id> or /adres/<id>/<anything>: the place's id, then the rest. */
const UNDER_ADDRESS = /^\/adres\/([^/]+)(?:\/([^/]+))?\/?$/;

/**
 * Whether proxy.ts answers the path with the 404 page before any render: an
 * address with something after the id that is no subpage or file, or an id
 * that is not in `places` (every place's, a renamed one's old one too). With
 * `places` null (not loaded), only the first. Each address route serves its
 * prerendered shell, a 200, before the page knows the place, so its own
 * notFound() comes too late for the status: only the proxy can answer 404.
 */
export function unknownAddress(
  pathname: string,
  places: ReadonlySet<string> | null,
): boolean {
  const match = UNDER_ADDRESS.exec(pathname);
  if (!match) return false;
  let id: string;
  let rest: string | undefined;
  try {
    id = decodeURIComponent(match[1]);
    rest = match[2] && decodeURIComponent(match[2]);
  } catch {
    return true;
  }
  if (rest !== undefined && !isAddressPart(rest)) return true;
  return places !== null && !places.has(id);
}

function isAddressPart(name: string): boolean {
  return (
    (SUBPAGE_IDS as readonly string[]).includes(name) ||
    FILE_NAMES.includes(name)
  );
}
