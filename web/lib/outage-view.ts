// The one shape an outages subpage is drawn from (components/outage-page.tsx),
// whatever is cut: water (components/water-page.tsx waterPage) and power
// (lib/power-module.ts powerPage) each fill it from their own data. Pure
// and client-safe.
import type { Checked, Part } from "./hub.ts";

/** A row of an outage's summary list: „Godziny”, „Gdzie”. */
type OutageRowView = {
  key: string;
  value: Part[];
  /**
   * A badge before the value (components/badge.tsx): „Awaria” (alert),
   * „Planowane wyłączenie” (the module's), „Odwołane” (muted).
   */
  badge?: { text: string; tone: "alert" | "mod" | "muted" };
  /** Windows of hours, a chip each, after the value. */
  chips?: string[];
};

/** One outage on a day: its summary list. */
type OutageBlock = { key: string; rows: OutageRowView[] };

/**
 * „Godziny”: each window a chip; with no window known, `none`, the line
 * that the source gives none.
 */
export function hoursRow(windows: string[], none: string): OutageRowView {
  const chips = windows.filter(Boolean);
  return chips.length > 0
    ? { key: "Godziny", value: [], chips }
    : { key: "Godziny", value: [none] };
}

export type OutagePage = {
  /** An inset above everything: the data may be out of date. */
  note: Part[] | null;
  calendar: {
    href: string;
    label: string;
    hint: string;
    /** The analytics event (components/web-analytics.tsx). */
    event: "water_calendar_add";
    place: string;
  } | null;
  /** With no outage: why, in plain text; null when there are outages. */
  empty: Part[] | null;
  /** A day each (Warsaw, ISO), soonest first, its outages in order. */
  days: Array<{ date: string; blocks: OutageBlock[] }>;
  /** After the days: one left out for the house number. */
  trace: string | null;
  /** „Inne komunikaty”: a line each; none, no section. */
  others: Array<{ key: string; parts: Part[] }>;
  /** The read-by-a-program note; null: none. */
  aiNote: string | null;
  sources: Part[][];
  checkedAt: Checked;
};
