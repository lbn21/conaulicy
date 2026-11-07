// The waste module's lines for „Najbliższe dni” (lib/upcoming.ts), on the
// server (their spans carry formatted labels, lib/hub.ts span). Pure, so the
// unit tests need no database.
import type { PlaceView } from "@/lib/schedule";
import { addDays, warsawToIso } from "./dates.ts";
import { span } from "./hub.ts";
import { putOutLine } from "./schedule-notes.ts";
import { type Item, WINDOW_DAYS } from "./upcoming.ts";
import { allBins } from "./waste-module.ts";

/**
 * The block's pickups: every one in its window (today and the next six
 * days, WINDOW_DAYS; task 261, so a day without one is truly empty), each
 * shown from the day it enters the window, the bins in running text, and
 * when to put them out until that time.
 */
export function wasteUpcoming(place: PlaceView): Item[] {
  if (place.askNumber || place.zoneId === null) return [];
  return place.days
    .filter(
      (day) =>
        day.date >= place.today &&
        day.date <= addDays(place.today, WINDOW_DAYS - 1),
    )
    .map((day) => {
      const time = day.pickups.find((pickup) => pickup.putOutBy)?.putOutBy;
      return {
        module: "smieci",
        span: span(day.date, null, null),
        shownFrom: warsawToIso(
          `${addDays(day.date, 1 - WINDOW_DAYS)} 00:00:00`,
        ),
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
