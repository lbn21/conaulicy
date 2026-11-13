"use client";

import { Fragment } from "react";
import { DayWord } from "@/components/day-word";
import { usePageDay } from "@/components/page-day";
import { Bins } from "@/components/waste-bins";
import { absoluteDay, dayFace } from "@/lib/dates";
import type { PickupDay } from "@/lib/schedule";
import { NO_MORE_DATES, putOutNote } from "@/lib/schedule-notes";

const HERO_COUNT = 3;

// A day as its date, absolute, with its weekday; „dziś, ” or „jutro, ”
// before it (components/day-word.tsx).
function SpokenDay({ iso }: { iso: string }) {
  return (
    <>
      <DayWord day={iso} form="word" />
      {absoluteDay(iso)}
    </>
  );
}

function PutOutBy({ day }: { day: PickupDay }) {
  const putOutBy = day.pickups.find((p) => p.putOutBy)?.putOutBy;
  if (!putOutBy) return null;
  return (
    <p className="govuk-body govuk-!-margin-top-2 govuk-!-margin-bottom-0">
      {putOutNote(putOutBy)}
    </p>
  );
}

/**
 * The next pickup, with the big date. Screen readers hear "Najbliższy
 * odbiór:" and the date in words; the big figures are for the eye only.
 */
function NextPickup({ day }: { day: PickupDay }) {
  const face = dayFace(day.date);
  return (
    <div className="app-card app-card--accent">
      <h3 className="govuk-heading-s govuk-!-margin-bottom-3">
        <time dateTime={day.date}>
          <span className="govuk-visually-hidden">
            Najbliższy odbiór: <SpokenDay iso={day.date} />
          </span>
          <span aria-hidden="true">
            <span className="govuk-!-display-block">
              <DayWord day={day.date} form="label" text="Najbliższy odbiór" />
            </span>
            <span className="govuk-!-display-block govuk-!-font-size-80">
              {face.day}
            </span>
            <span className="govuk-!-display-block govuk-!-font-size-24 govuk-!-font-weight-regular">
              {face.month}, {face.weekday}
            </span>
          </span>
        </time>
      </h3>
      <Bins pickups={day.pickups} size="large" />
      <PutOutBy day={day} />
    </div>
  );
}

/**
 * Further pickups: per date a heading, then its bins, dates divided by
 * GOV.UK's visible section break. A heading and a list at every width: a
 * Polish date with its weekday never wraps in a narrow key column. In a
 * card, or bare inside „Pokaż więcej” (the details' own indent is its
 * frame).
 */
function DayList({
  days,
  framed = true,
}: {
  days: PickupDay[];
  framed?: boolean;
}) {
  const list = days.map((day, i) => (
    <Fragment key={day.date}>
      {i > 0 && (
        <hr className="govuk-section-break govuk-section-break--m govuk-section-break--visible" />
      )}
      <h3 className="govuk-heading-s govuk-!-margin-bottom-2">
        <time dateTime={day.date}>
          <SpokenDay iso={day.date} />
        </time>
      </h3>
      <Bins pickups={day.pickups} size="medium" />
      <PutOutBy day={day} />
    </Fragment>
  ));
  return framed ? <div className="app-card">{list}</div> : list;
}

export function PickupSchedule({
  days,
  next,
  later = null,
}: {
  days: PickupDay[];
  /** When the next dates come, once these are past (noMoreDatesNext). */
  next: string;
  /** After the last date: when the next dates come (laterNote). */
  later?: string | null;
}) {
  // From the page's day on (components/page-day.tsx).
  const today = usePageDay();
  const visible = days.filter((day) => day.date >= today);

  if (visible.length === 0) {
    return <p className="govuk-body">{`${NO_MORE_DATES}. ${next}`}</p>;
  }

  const hero = visible.slice(0, HERO_COUNT);
  const rest = visible.slice(HERO_COUNT);

  return (
    <section aria-labelledby="pickups-heading">
      <h2 id="pickups-heading" className="govuk-visually-hidden">
        Najbliższe odbiory
      </h2>
      <NextPickup day={hero[0]} />
      {hero.length > 1 && <DayList days={hero.slice(1)} />}
      {rest.length > 0 && (
        <details className="govuk-details">
          <summary className="govuk-details__summary">
            <span className="govuk-details__summary-text">
              Pokaż więcej terminów
            </span>
          </summary>
          <div className="govuk-details__text">
            <DayList days={rest} framed={false} />
          </div>
        </details>
      )}
      {later && <p className="govuk-body">{later}</p>}
    </section>
  );
}
