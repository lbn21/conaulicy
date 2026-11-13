import "server-only";
import { hubPage, subpage } from "@/lib/address-pages";
import { SUBPAGE_IDS } from "@/lib/address-routes";
import {
  allPlacesPage,
  pdfPage,
  searchIndexPage,
  sitemapPage,
  waterIcsPage,
  zoneIcsPage,
} from "@/lib/data-pages";
import { homePage } from "@/lib/home-page";
import type { SubpageId } from "@/lib/module-ids";
import type { PageDef } from "@/lib/page-cache";
import { placeParams, zoneParams } from "@/lib/schedule";

// Every prerendered page and file whose data can change, one PageDef each
// (lib/page-cache.ts): the pages read their view through it (pageData),
// and the zuk cron reads every one's view the same way for its digest
// (lib/page-refresh.ts), so a page is re-rendered when what it renders
// changes, and only then. The defs live beside what they read, so no page
// imports another's components: the home page's (lib/home-page.ts), the
// address pages' (lib/address-pages.ts), the lists' and files'
// (lib/data-pages.ts). Only the cron imports this registry.

/**
 * Every page and file of the dataset this deployment serves, in the order
 * the cron refreshes them: the home page first, then the address pages,
 * their subpages, the lists and the files.
 */
export async function allPages(): Promise<PageDef<unknown>[]> {
  const ids = (await placeParams()).map(({ id }) => id);
  const zones = (await zoneParams()).map(({ zoneId }) => zoneId);
  return [
    homePage,
    ...ids.map(hubPage),
    ...SUBPAGE_IDS.flatMap((slug) =>
      ids.map((id) => subpage(id, slug as SubpageId)),
    ),
    allPlacesPage,
    sitemapPage,
    searchIndexPage,
    ...ids.map(pdfPage),
    ...ids.map(waterIcsPage),
    ...zones.map(zoneIcsPage),
  ] as PageDef<unknown>[];
}
