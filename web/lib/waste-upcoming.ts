// The waste module's lines for „Najbliższe dni” (lib/upcoming.ts), on the
// server (their spans carry formatted labels, lib/hub.ts span). Pure, so the
// unit tests need no database.
import type { PlaceView } from "@/lib/schedule";
import { addDays, warsawToIso } from "./dates.ts";
import { span } from "./hub.ts";
import { putOutLine } from "./schedule-notes.ts";
import type { Item } from "./upcoming.ts";
import { allBins } from "./waste-module.ts";

/**
 * The block's pickups: the next two days (today and tomorrow at most are
 * shown, from the day before; the island moves on without a new render),
 * the bins in running text, and when to put them out until that time.
 */
export function wasteUpcoming(place: PlaceView): Item[] {
  if (place.askNumber || place.zoneId === null) return [];
  return place.days
    .filter((day) => day.date >= place.today)
    .slice(0, 2)
    .map((day) => {
      const time = day.pickups.find((pickup) => pickup.putOutBy)?.putOutBy;
      return {
        module: "smieci",
        span: span(day.date, null, null),
        shownFrom: warsawToIso(`${addDays(day.date, -1)} 00:00:00`),
        bins: allBins(place, day)
          ? "wszystkie pojemniki"
          : day.pickups
              .map((p) => p.label.charAt(0).toLowerCase() + p.label.slice(1))
              .join(", "),
        second: time ? putOutLine(time) : null,
        secondUntil: time ? warsawToIso(`${day.date} ${time}:00`) : null,
      };
    });
}
