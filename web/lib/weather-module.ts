// What the weather module (lib/modules.ts) says on the address page: IMGW's
// warnings for the powiat (lib/imgw-shown.ts), a card each above the
// timeline (components/warning-cards.tsx), with a notice when
// the copy is old. Pure, so the unit tests read every state.
import { dayMonthTime, momentRange } from "./date-labels.ts";
import type { Group } from "./hub.ts";
import {
  CURRENT,
  IMGW_PAGE,
  type ImgwRead,
  type Shown,
  type ShownWarning,
  shownWarnings,
  UNREADABLE,
} from "./imgw-shown.ts";

export type Weather = {
  /** null: fresh, and no warning in force or to come. */
  shown: Shown | null;
  /** The last good check (ms); null: the store could not be read now. */
  checkedAt: number | null;
  /** When IMGW's items last changed (ms); null: unknown. */
  changedAt: number | null;
};

/**
 * The module's data, or null when there is no copy of the feed yet: then
 * the address page says it has not been checked yet. The store
 * unreadable: the notice, no check time.
 */
export function weather(copy: ImgwRead, now: number): Weather | null {
  if (!copy) return null;
  return {
    shown: shownWarnings(copy, now),
    checkedAt: copy === UNREADABLE ? null : copy.checkedAt,
    changedAt: copy === UNREADABLE ? null : copy.changedAt,
  };
}

/**
 * When a warning applies, in its card: „Trwa do 11 listopada
 * 19:00.” once it has begun, else „Od 11 listopada, 10:00 do 16:00.”
 * (Intl's range, lib/date-labels.ts momentRange).
 */
export function warningWhen(warning: ShownWarning, now: number): string {
  const from = Date.parse(warning.from);
  const to = Date.parse(warning.to);
  if (from <= now) return `Trwa do ${dayMonthTime(to)}.`;
  const [start, end] = momentRange(from, to);
  return `Od ${start} do ${end}.`;
}

/**
 * The hub's IMGW lines that belong to no day: the notice when
 * the copy is old or unreadable, its link IMGW's page; else none.
 */
export function weatherNotices(data: Weather): Group[] {
  const notice = data.shown?.notice;
  return notice
    ? [
        [
          [
            `${notice} ${CURRENT.text} `,
            { href: IMGW_PAGE, text: CURRENT.link },
            ".",
          ],
        ],
      ]
    : [];
}
