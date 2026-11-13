// The address page's URLs: the page itself (/adres/<id>) and one subpage per
// module (/adres/<id>/<module>), each taking a house number as ?nr= (read
// from searchParams: lib/house.ts houseQuery) on its own route, under
// /adres/<id>/nr/, where proxy.ts sends it (queryRoute). Pure, so the unit tests,
// proxy.ts and lib/clean-query.ts share one list (lib/modules.ts is the
// registry; it needs Next.js, so it cannot be loaded here).
import { MODULE_IDS, type ModuleId, SUBPAGE_IDS } from "./module-ids.ts";

export { MODULE_IDS, type ModuleId, SUBPAGE_IDS };

/**
 * The address's files, /adres/<id>/<file>: route folders under
 * app/adres/[id]/, which take ?nr= as the subpages do, beside each
 * subpage's own folder, so no module may be called this.
 */
export const FILE_NAMES = ["harmonogram.pdf", "woda.ics"];

/**
 * The folder of the address routes that read ?nr= and ?imgw=,
 * app/adres/[id]/nr/: only proxy.ts's rewrite reaches it (queryRoute), so
 * no module may be called this either; asked for itself, a 404.
 */
export const QUERY_FOLDER = "nr";

export function isModuleId(slug: string): slug is ModuleId {
  return (MODULE_IDS as readonly string[]).includes(slug);
}

const MODULE = `(?:/(?:${SUBPAGE_IDS.join("|")}))?`;

/** /adres/<id> or /adres/<id>/<module>, which take ?nr=. */
export const ADDRESS = new RegExp(`^(/adres/[^/]+${MODULE})/?$`);

/** ADDRESS, its place's path and its module apart. */
const ADDRESS_PARTS = new RegExp(`^(/adres/[^/]+)(${MODULE})/?$`);

/** /api/places: every place's id, and renamed ones' old id → new id. */
export type PlacesMap = { ids: string[]; moved: Record<string, string> };

/** /adres/<id>[/<anything>…]: the place's id, then the rest. */
const UNDER_ADDRESS = /^\/adres\/([^/]+)((?:\/[^/]+)*)\/?$/;

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
  let rest: string[];
  try {
    id = decodeURIComponent(match[1]);
    rest = match[2].split("/").slice(1).map(decodeURIComponent);
  } catch {
    return true;
  }
  // One name at most after the id: a subpage or a file.
  if (rest.length > 1 || (rest.length === 1 && !isAddressPart(rest[0])))
    return true;
  return places !== null && !places.has(id);
}

/**
 * The route that reads the query: for an address (ADDRESS) with ?nr= or
 * ?imgw= (lib/clean-query.ts has dropped any other), the path proxy.ts
 * rewrites it to, /adres/<id>/nr[/<module>], the query kept; null for any
 * other request. The place alone stays on its prerendered route.
 */
export function queryRoute(
  pathname: string,
  searchParams: URLSearchParams,
): string | null {
  const match = ADDRESS_PARTS.exec(pathname);
  if (!match || searchParams.size === 0) return null;
  return `${match[1]}/${QUERY_FOLDER}${match[2] ?? ""}`;
}

function isAddressPart(name: string): boolean {
  return (
    (SUBPAGE_IDS as readonly string[]).includes(name) ||
    FILE_NAMES.includes(name)
  );
}
