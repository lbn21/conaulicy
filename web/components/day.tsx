import type { ReactNode } from "react";
import { DayWord } from "@/components/day-word";
import { FunctionRows } from "@/components/function-rows";
import { absoluteDay, capitalised, dayFace } from "@/lib/dates";
import type { PlaceView } from "@/lib/schedule";
import type { DayGroup, Entry } from "@/lib/timeline";

// The timeline's cards (task 263): GOV.UK's summary card, its title an h3.
// A day („Dziś, wtorek, 10 listopada”, DayWord), a run of empty days
// („Środa 11 – sobota 14 listopada”), and „Później”.

/** What an empty day or run says. */
export const NOTHING = "Nic nie zaplanowano.";

export function SummaryCard({
  title,
  children,
}: {
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="govuk-summary-card">
      <div className="govuk-summary-card__title-wrapper">
        <h3 className="govuk-summary-card__title">{title}</h3>
      </div>
      <div className="govuk-summary-card__content">{children}</div>
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

/** A day's card, or a run of empty days'. */
export function Day({
  group: { from, to, entries },
  place,
}: {
  group: DayGroup;
  place: PlaceView;
}) {
  const title =
    from === to ? (
      <DayWord day={from} form="title" text={absoluteDay(from)} />
    ) : (
      rangeTitle(from, to)
    );
  return (
    <SummaryCard title={title}>
      {entries.length === 0 ? (
        <p className="govuk-body govuk-!-margin-bottom-0">{NOTHING}</p>
      ) : (
        <FunctionRows entries={entries} place={place} />
      )}
    </SummaryCard>
  );
}

/** „Później”: the next item per module after the window; none, no card. */
export function LaterCard({
  entries,
  place,
}: {
  entries: Entry[];
  place: PlaceView;
}) {
  if (entries.length === 0) return null;
  return (
    <SummaryCard title="Później">
      <FunctionRows entries={entries} place={place} dateOnly />
    </SummaryCard>
  );
}
