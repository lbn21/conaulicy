import "server-only";
import { searchIndex } from "./schedule.ts";

/**
 * Every place search can find (the dataset snapshot's search index, as
 * /ulice and the sitemap): the address routes prerender them all at build (their
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
