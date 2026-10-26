import { fileSlug } from "./normalize.ts";

// The waste calendar's names (app/ics/[zoneId]): the one the calendar app
// shows and the file's, both from the zone's own name, never its id.

/** "Wywóz śmieci – Gmina Lubaczów, sektor 1". */
export function wasteCalendarName(zoneName: string): string {
  return `Wywóz śmieci – ${zoneName}`;
}

/** "wywoz-smieci-gmina-lubaczow-sektor-1.ics". */
export function wasteFilename(zoneName: string): string {
  return `${fileSlug(wasteCalendarName(zoneName))}.ics`;
}
