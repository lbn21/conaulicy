// What the waste module (lib/modules.ts) says about a place, from today's
// street page data (PlaceView, unchanged). Pure, so the unit tests need no
// database.
import type { PlaceView } from "@/lib/schedule";
import { longDate } from "./date-labels.ts";
import { putOutNote } from "./schedule-notes.ts";

/** One row of a module's summary: key, value. */
export type SummaryRow = [string, string];

export type ModuleStatus = {
  /** "unsupported": a place we have no pickup data for. */
  state: "ok" | "stale" | "error" | "unsupported";
  sources: PlaceView["sources"];
};

/**
 * The next pickup, its bins and when to put them out; null when there is
 * nothing to show (no data, a number to ask for, or no dates left).
 */
export function wasteSummary(place: PlaceView): SummaryRow[] | null {
  if (place.askNumber) return null;
  const next = place.days.find((day) => day.date >= place.today);
  if (!next) return null;
  const rows: SummaryRow[] = [
    ["Najbliższy odbiór", longDate(next.date)],
    ["Pojemniki", next.pickups.map((pickup) => pickup.label).join(", ")],
  ];
  const putOutBy = next.pickups.find((pickup) => pickup.putOutBy)?.putOutBy;
  if (putOutBy) rows.push(["Wystaw", putOutNote(putOutBy)]);
  return rows;
}

export function wasteStatus(place: PlaceView): ModuleStatus {
  return {
    state: place.zoneId === null && !place.askNumber ? "unsupported" : "ok",
    sources: place.sources,
  };
}
