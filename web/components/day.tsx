import type { ReactNode } from "react";
import { DayWord } from "@/components/day-word";
import { FunctionRows } from "@/components/function-rows";
import { absoluteDay, capitalised, dayRange, relativeDay } from "@/lib/dates";
import type { PlaceView } from "@/lib/schedule";
import type { DayGroup, Entry } from "@/lib/timeline";

// The timeline's days: each an li of
// components/timeline.tsx's ol (site.scss .app-timeline). A day with
// items is a card, its date an h3 („Wtorek, 10 listopada” and DayWord's
// badge); an empty day or run of them („11–15 listopada”, Intl's
// formatRange) a plain row, no card and no badge, today and tomorrow too
// (t373: a card only for a day with something), its date the same h3 over
// „Nic nie zaplanowano.”, a run's line dashed alongside it; „Później” a
// card at the ringed end of the line. Each li starts with its dot, an
// empty aria-hidden span (site.scss lays it out on the grid); the li
// holding the read's day (place.today) is marked app-timeline__today, its
// dot filled, whatever the row is; an empty one says „dzisiaj” (Intl's
// word) to screen readers only, after its date.

/** What an empty day or run says. */
const NOTHING = "Nic nie zaplanowano.";

/**
 * A timeline card, every kind the same: the date as an h3,
 * GOV.UK's heading-s (19/25, its dot's line), then the body, all of it
 * body-s (16/20).
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

/** A day's li: a card, or for empty days a plain row. */
export function Day({
  group: { from, to, entries },
  place,
}: {
  group: DayGroup;
  place: PlaceView;
}) {
  const empty = entries.length === 0;
  const today = from <= place.today && place.today <= to;
  const title = (
    <>
      {from === to ? (
        <time dateTime={from}>{capitalised(absoluteDay(from))}</time>
      ) : (
        <time dateTime={from}>{dayRange(from, to)}</time>
      )}
      {!empty && <DayWord day={from} form="title" />}
      {/* An empty row holding today has no badge: its date alone on
        screen, today's word (Intl's) for screen readers only (t373, c). */}
      {empty && today && (
        <span className="govuk-visually-hidden">
          {`, ${relativeDay(place.today, place.today)}`}
        </span>
      )}
    </>
  );
  return (
    <li
      className={
        [
          today && "app-timeline__today",
          empty && "app-timeline__empty",
          from !== to && "app-timeline__range",
        ]
          .filter(Boolean)
          .join(" ") || undefined
      }
    >
      <span className="app-timeline__dot" aria-hidden="true" />
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

/** „Później”: lib/timeline.ts later's items; none, no li. */
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
      <span className="app-timeline__dot" aria-hidden="true" />
      <TimelineCard title="Później">
        <FunctionRows entries={entries} place={place} dateOnly />
      </TimelineCard>
    </li>
  );
}
