import "server-only";
import { firstHouseNumber } from "./prg.ts";
import { searchIndex } from "./schedule.ts";

/**
 * Every place search can find (the search index, as /ulice and the
 * sitemap): the address routes prerender them all at build (their
 * generateStaticParams), so a known place never gets the route's fallback
 * shell, which ensureStatic 'prefetch' serves for a param not prerendered
 * (nextjs.org/docs/app/api-reference/file-conventions/route-segment-config/ensureStatic,
 * "Dynamic route parameters"). A place an import adds before the next
 * deploy gets it once, on its first visit.
 */
export async function allPlaces(): Promise<Array<{ id: string }>> {
  const { places } = await searchIndex();
  return places.map(([id]) => ({ id }));
}

/**
 * The one address with a house number the number routes prerender at build
 * (Cache Components needs at least one per route:
 * nextjs.org/docs/app/guides/migrating-to-cache-components); house numbers
 * are unbounded, so any other gets the route's fallback shell on its first
 * visit. The first place of the search index with a house number in the
 * register.
 */
export async function firstAddress(): Promise<{ id: string; nr: string[] }> {
  const { places } = await searchIndex();
  for (const [id] of places) {
    const nr = firstHouseNumber(id);
    if (nr) return { id, nr: nr.split("/") };
  }
  throw new Error("No place with a house number to prerender");
}
