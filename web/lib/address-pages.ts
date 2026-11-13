import "server-only";
import { MODULE_IDS, type SubpageId } from "@/lib/module-ids";
import { MODULES, type Module } from "@/lib/modules";
import { type PageDef, SOURCE_TAGS } from "@/lib/page-cache";
import { placePath } from "@/lib/places";
import { getPlace, type PlaceView } from "@/lib/schedule";

// The address page's and its subpages' PageDefs (lib/page-cache.ts): the
// modules' data (lib/modules.ts). The registry of every page: lib/pages.ts.

const MODULE_LIST = MODULE_IDS.map((slug): Module<unknown> => MODULES[slug]);

/**
 * The address page: every module's data, in registry order (the first,
 * waste's, is the place itself); null: no such place.
 */
export function hubPage(id: string): PageDef<unknown[] | null> {
  return {
    path: placePath(id),
    sources: [...new Set(MODULE_LIST.flatMap((module) => module.tags))],
    async load(reads) {
      const data = await Promise.all(
        MODULE_LIST.map((module) => module.load(id, reads)),
      );
      return data[0] === null ? null : data;
    },
  };
}

/** A module's subpage: the place and the module's data; null: no place. */
export function subpage(
  id: string,
  slug: SubpageId,
): PageDef<{ place: PlaceView; data: unknown } | null> {
  const module = MODULES[slug] as Module<unknown>;
  return {
    path: `${placePath(id)}/${slug}`,
    sources: [...new Set([SOURCE_TAGS.dataset, ...module.tags])],
    async load(reads) {
      const [place, data] = await Promise.all([
        getPlace(id, reads.now),
        module.load(id, reads),
      ]);
      return place ? { place, data } : null;
    },
  };
}
