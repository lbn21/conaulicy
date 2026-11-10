import type { ReactNode } from "react";
import { DayWord } from "@/components/day-word";
import { FunctionRows } from "@/components/function-rows";
import { absoluteDay, capitalised, dayRange } from "@/lib/dates";
import type { PlaceView } from "@/lib/schedule";
import type { DayGroup, Entry } from "@/lib/timeline";

// The timeline's days (task 263, restyled in task 264): each an li of
// components/timeline.tsx's ol (site.scss .app-timeline). A day with
// items is a card, its date an h3 („Wtorek, 10 listopada · dzisiaj”, the
// word DayWord's, task 268); an empty day or run of them („11–15
// listopada”, Intl's formatRange, no word) a muted grey card, its date the
// same h3 over „Nic nie zaplanowano.” (task 266), a run's line dashed
// alongside its card (task 268);
// „Później” a card at the ringed end of the line (task 265).

/** What an empty day or run says. */
const NOTHING = "Nic nie zaplanowano.";

/**
 * A timeline card, every kind the same (task 266): the date as an h3,
 * GOV.UK's heading-s (19/25, its dot's line), then the body, all of it
 * body-s (16/20, task 269).
 */
function TimelineCard({
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
      <h3 className="govuk-heading-s govuk-!-margin-bottom-2 app-timeline__title">
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
  const title =
    from === to ? (
      <>
        <time dateTime={from}>{capitalised(absoluteDay(from))}</time>
        <DayWord day={from} form="title" />
      </>
    ) : (
      <time dateTime={from}>{dayRange(from, to)}</time>
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
          <p className="govuk-body-s govuk-!-margin-bottom-0">{NOTHING}</p>
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
