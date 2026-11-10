// The waste module's entries for the timeline (lib/upcoming.ts), on the
// server (their spans carry formatted labels, lib/hub.ts span). Pure, so the
// unit tests need no database.
import type { PlaceView } from "@/lib/schedule";
import { span } from "./hub.ts";
import { putOutLine } from "./schedule-notes.ts";
import type { Item } from "./upcoming.ts";
import { allBins } from "./waste-module.ts";

/**
 * The timeline's pickups (lib/timeline.ts): every day from today on,
 * the bins in running text, and when to put them out.
 */
export function wasteUpcoming(place: PlaceView): Item[] {
  if (place.askNumber || place.zoneId === null) return [];
  return place.days
    .filter((day) => day.date >= place.today)
    .map((day) => {
      const time = day.pickups.find((pickup) => pickup.putOutBy)?.putOutBy;
      return {
        module: "smieci",
        span: span(day.date, null, null),
        pickups: day.pickups,
        bins: allBins(place, day)
          ? "wszystkie pojemniki"
          : day.pickups
              .map((p) => p.label.charAt(0).toLowerCase() + p.label.slice(1))
              .join(", "),
        second: time ? putOutLine(time) : null,
      };
    });
}
