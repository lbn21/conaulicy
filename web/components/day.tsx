import type { ReactNode } from "react";
import { DayWord } from "@/components/day-word";
import { FunctionRows } from "@/components/function-rows";
import { absoluteDay, capitalised, dayFace } from "@/lib/dates";
import type { PlaceView } from "@/lib/schedule";
import type { DayGroup, Entry } from "@/lib/timeline";

// The timeline's days (task 263, restyled in task 264): each an li of
// components/timeline.tsx's ol (site.scss .app-timeline). A day with
// items is a card, its date an h3 („Dziś, wtorek, 10 listopada”, DayWord);
// an empty day or run of them („Środa 11 – sobota 14 listopada”) only a
// muted line, no card; „Później” a card past the dashed end of the line.

/** What an empty day or run says. */
export const NOTHING = "Nic nie zaplanowano.";

/** A timeline card: the h3, then the rows. */
export function TimelineCard({
  title,
  children,
}: {
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="app-timeline__card">
      <h3 className="govuk-heading-s govuk-!-margin-bottom-2">{title}</h3>
      {children}
    </div>
  );
}

/** „Środa 11 – sobota 14 listopada”, the month once when it is the same. */
function rangeTitle(from: string, to: string): string {
  const a = dayFace(from);
  const b = dayFace(to);
  const first = a.month === b.month ? a.day : `${a.day} ${a.month}`;
  return capitalised(
    `${a.weekday} ${first} – ${b.weekday} ${b.day} ${b.month}`,
  );
}

/** A day's li: a card, or for empty days a muted line. */
export function Day({
  group: { from, to, entries },
  place,
}: {
  group: DayGroup;
  place: PlaceView;
}) {
  const today = from === place.today;
  if (entries.length === 0) {
    const text =
      from === to ? (
        <DayWord day={from} form="title" text={absoluteDay(from)} />
      ) : (
        rangeTitle(from, to)
      );
    return (
      <li
        className={
          today
            ? "app-timeline__empty app-timeline__today"
            : "app-timeline__empty"
        }
      >
        <p className="govuk-hint govuk-!-margin-bottom-0">
          <time dateTime={from}>{text}</time> · {NOTHING}
        </p>
      </li>
    );
  }
  return (
    <li className={today ? "app-timeline__today" : undefined}>
      <TimelineCard
        title={
          <time dateTime={from}>
            <DayWord day={from} form="title" text={absoluteDay(from)} />
          </time>
        }
      >
        <FunctionRows entries={entries} place={place} />
      </TimelineCard>
    </li>
  );
}

/** „Później”: the next item per module after the window; none, no li. */
export function LaterCard({
  entries,
  place,
}: {
  entries: Entry[];
  place: PlaceView;
}) {
  if (entries.length === 0) return null;
  return (
    <li className="app-timeline__later">
      <TimelineCard title="Później">
        <FunctionRows entries={entries} place={place} dateOnly />
      </TimelineCard>
    </li>
  );
}
