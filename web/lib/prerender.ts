import "server-only";
import { firstHouseNumber } from "./prg.ts";
import { searchIndex } from "./schedule.ts";

/**
 * The one address the address routes prerender at build (their
 * generateStaticParams): Cache Components needs at least one per route
 * (nextjs.org/docs/app/guides/migrating-to-cache-components). The first
 * place of the search index with a house number in the register, so the
 * number routes have one too. Every other address renders on its first
 * visit and is cached, as before.
 */
export async function firstAddress(): Promise<{ id: string; nr: string[] }> {
  const { places } = await searchIndex();
  for (const [id] of places) {
    const nr = firstHouseNumber(id);
    if (nr) return { id, nr: nr.split("/") };
  }
  throw new Error("No place with a house number to prerender");
}
