import type { ReactNode } from "react";
import { DayWord } from "@/components/day-word";
import { FunctionRows } from "@/components/function-rows";
import { absoluteDay, dayRange } from "@/lib/dates";
import type { PlaceView } from "@/lib/schedule";
import type { DayGroup, Entry } from "@/lib/timeline";

// The timeline's days (task 263, restyled in task 264): each an li of
// components/timeline.tsx's ol (site.scss .app-timeline). A day with
// items is a card, its date an h3 („Dzisiaj · wtorek, 10 listopada”,
// DayWord); an empty day or run of them („Jutro · środa, 11 listopada –
// niedziela, 15 listopada”, Intl's formatRange) a muted grey card, its date
// the same h3 over „Nic nie zaplanowano.” (task 266), a run with a dot at
// each end and a dashed line between (task 267);
// „Później” a card at the ringed end of the line (task 265).

/** What an empty day or run says. */
export const NOTHING = "Nic nie zaplanowano.";

/**
 * A timeline card, every kind the same (task 266): the date as an h3, a
 * small bold line of its own (16/20, its dot's line), then the body.
 */
export function TimelineCard({
  title,
  empty = false,
  children,
}: {
  title: ReactNode;
  empty?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={
        empty
          ? "app-timeline__card app-timeline__card--empty"
          : "app-timeline__card"
      }
    >
      <h3 className="govuk-body-s govuk-!-font-weight-bold govuk-!-margin-bottom-2 app-timeline__title">
        {title}
      </h3>
      {children}
    </div>
  );
}

/** A day's li: a card, for empty days a muted one. */
export function Day({
  group: { from, to, entries },
  place,
}: {
  group: DayGroup;
  place: PlaceView;
}) {
  const today = from === place.today;
  const title = (
    <time dateTime={from}>
      <DayWord
        day={from}
        form="title"
        text={from === to ? absoluteDay(from) : dayRange(from, to)}
      />
    </time>
  );
  const empty = entries.length === 0;
  return (
    <li
      className={
        [
          empty && "app-timeline__empty",
          from !== to && "app-timeline__range",
          today && "app-timeline__today",
        ]
          .filter(Boolean)
          .join(" ") || undefined
      }
    >
      <TimelineCard title={title} empty={empty}>
        {empty ? (
          <p className="govuk-body govuk-!-margin-bottom-0">{NOTHING}</p>
        ) : (
          <FunctionRows entries={entries} place={place} />
        )}
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
