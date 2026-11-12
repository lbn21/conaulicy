import type { ReactNode } from "react";
import { DayWord } from "@/components/day-word";
import { FunctionRows } from "@/components/function-rows";
import { dayFace, dayRange, relativeDay } from "@/lib/dates";
import type { PlaceView } from "@/lib/schedule";
import type { DayGroup, Entry } from "@/lib/timeline";

// The timeline's days: each an li of
// components/timeline.tsx's ol (site.scss .app-timeline). A day with
// items is a card, its date an h3 („10 listopada” and DayWord's badge),
// its weekday („wtorek”) a small grey line under it (t385; in the h3 for
// screen readers only, the line aria-hidden, so it is read once, with the
// date); an empty day the same, a plain row, no card and no badge, today
// and tomorrow too (t373: a card only for a day with something), over
// „Nic nie zaplanowano.”; a run of them („11–15 listopada”, Intl's
// formatRange) no weekday line, its line dashed alongside it; „Później” a
// card at the ringed end of the line. Each li starts with its dot, an
// empty aria-hidden span (site.scss lays it out on the grid); the li
// holding the read's day (place.today) is marked app-timeline__today, its
// dot filled, whatever the row is; an empty one says „dzisiaj” (Intl's
// word) to screen readers only, after its date.

/** What an empty day or run says. */
const NOTHING = "Nic nie zaplanowano.";

/**
 * A timeline card, every kind the same: the date as an h3,
 * GOV.UK's heading-s (19/25, its dot's line), a day's weekday under it,
 * then the body, all of it body-s (16/20).
 */
function TimelineCard({
  title,
  weekday,
  empty = false,
  children,
}: {
  title: ReactNode;
  weekday?: string;
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
      <h3
        className={
          weekday
            ? "govuk-heading-s govuk-!-margin-bottom-0 app-timeline__title"
            : "govuk-heading-s govuk-!-margin-bottom-2 app-timeline__title"
        }
      >
        {title}
      </h3>
      {weekday && (
        <p
          className="govuk-body-s govuk-!-margin-bottom-2 app-quiet"
          aria-hidden="true"
        >
          {weekday}
        </p>
      )}
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
  const { day, month, weekday } = dayFace(from);
  const single = from === to;
  const title = (
    <>
      <time dateTime={from}>
        {single ? `${day} ${month}` : dayRange(from, to)}
      </time>
      {single && (
        <span className="govuk-visually-hidden">{`, ${weekday}`}</span>
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
      <TimelineCard
        title={title}
        weekday={single ? weekday : undefined}
        empty={empty}
      >
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
