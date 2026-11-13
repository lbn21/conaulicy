// npm run db:ci-fixture: the CI fixture. Replaces EVERYTHING in a local
// database (CI's service container, a local Docker Postgres; it refuses any
// other, see lib/local-db.ts) with a small made-up dataset, so the build and
// the checks have every kind of place to test. Production never holds it.
// Dates come from simple rules, for the 12 months starting with the current
// one; nothing here is a real schedule.
//
// The data itself: lib/dataset-fixture.ts (the site shows the same as a
// snapshot where none is published, lib/dataset.ts). Covers: a renamed street's old id (place_redirects), a city street from the old fixture URL (ul. Adama Asnyka), streets
// with diacritics, a street in no zone, a street whose schedule has ended
// (only past dates), villages without streets, villages with streets (each
// a place too: Lisie Jamy, Młodów, and Krowica Sama in a sector of its
// own), a village part whose village has streets (Pilipy, Młodów) and one
// whose village has none (Holiki, Dąbrowa), the places of the ZUK dev mock's post 39885
// (lib/water-fixture.ts: ul. Żuki, Załuże; Lisie Jamy above), one month
// with 6 pickup days and holiday-shifted dates, and the home page's examples
// (lib/examples.ts) under their real ids, and the PDF's worst case (WORST:
// every fraction, the most dates and marks the PDF is sized for).
import { drizzle } from "drizzle-orm/node-postgres";
import {
  events,
  gminy,
  localities,
  meta,
  placeRedirects,
  streets,
  zoneMembers,
  zones,
} from "../db/schema.ts";
import { fixtureRows } from "../lib/dataset-fixture.ts";
import { todayInWarsaw } from "../lib/dates.ts";
import { localDatabaseUrl } from "./lib/local-db.ts";

async function main() {
  const db = drizzle(localDatabaseUrl(), { casing: "snake_case" });
  const rows = fixtureRows(todayInWarsaw());
  const { window, busyMonth } = rows;
  const eventRows = rows.events;
  const streetRows = rows.streets;

  await db.transaction(async (tx) => {
    for (const table of [
      placeRedirects,
      events,
      zoneMembers,
      zones,
      streets,
      localities,
      gminy,
      meta,
    ]) {
      await tx.delete(table);
    }
    await tx.insert(gminy).values(rows.gminy);
    await tx.insert(localities).values(rows.localities);
    await tx.insert(streets).values(streetRows);
    await tx.insert(zones).values(rows.zones);
    await tx.insert(zoneMembers).values(rows.zoneMembers);
    await tx.insert(events).values(eventRows);
    // A renamed street's old page (made up): it must answer 308 to the new.
    await tx.insert(placeRedirects).values(rows.placeRedirects);
  });

  const shifted = eventRows.filter((e) => e.shiftedFrom);
  console.log(
    `CI fixture: ${streetRows.length} streets, ${rows.zones.length} zones, ${eventRows.length} events ` +
      `(${window[0]}…${window.at(-1)}; 6 pickup days in ${busyMonth} on sektor 1; ` +
      `${shifted.length} holiday-shifted).`,
  );
  await db.$client.end();
}

await main();
