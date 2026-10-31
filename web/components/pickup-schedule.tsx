"use client";

import { DayWord } from "@/components/day-word";
import { useWarsawToday } from "@/components/warsaw-today";
import { Bins } from "@/components/waste-bins";
import { absoluteDay, dayFace } from "@/lib/dates";
import type { PickupDay } from "@/lib/schedule";
import {
  NO_MORE_DATES,
  NO_MORE_DATES_NEXT,
  putOutNote,
} from "@/lib/schedule-notes";

const HERO_COUNT = 3;

// A day as its date, absolute, with its weekday; „dziś, ” or „jutro, ”
// before it is the device's (components/day-word.tsx), never the server's.
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
    <div className="govuk-!-margin-bottom-6">
      <h3 className="govuk-heading-s govuk-!-margin-bottom-3">
        <time dateTime={day.date}>
          <span className="govuk-visually-hidden">
            Najbliższy odbiór: <SpokenDay iso={day.date} />
          </span>
          <span aria-hidden="true">
            <span className="govuk-!-display-block govuk-!-font-size-27">
              <DayWord day={day.date} form="label" text="Najbliższy odbiór" />
            </span>
            <span className="govuk-!-display-block govuk-!-font-size-80">
              {face.day}
            </span>
            <span className="govuk-!-display-block govuk-!-font-size-24">
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

/** Further pickups: GOV.UK summary list, the date as key, bins as value. */
function DayList({ days }: { days: PickupDay[] }) {
  return (
    <dl className="govuk-summary-list">
      {days.map((day) => (
        <div key={day.date} className="govuk-summary-list__row">
          <dt className="govuk-summary-list__key">
            <time dateTime={day.date}>
              <SpokenDay iso={day.date} />
            </time>
          </dt>
          <dd className="govuk-summary-list__value">
            <Bins pickups={day.pickups} size="medium" />
            <PutOutBy day={day} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function PickupSchedule({
  days,
  renderedOn,
  later = null,
}: {
  days: PickupDay[];
  /** Warsaw day the server rendered for. */
  renderedOn: string;
  /** After the last date: when the next dates come (laterNote). */
  later?: string | null;
}) {
  // From the device's day on: the page is cached until the next import or
  // deploy, so the server's day may be past (components/warsaw-today.ts).
  const today = useWarsawToday(renderedOn);
  const visible = days.filter((day) => day.date >= today);

  if (visible.length === 0) {
    return (
      <p className="govuk-body">{`${NO_MORE_DATES}. ${NO_MORE_DATES_NEXT}`}</p>
    );
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
            <DayList days={rest} />
          </div>
        </details>
      )}
      {later && <p className="govuk-body">{later}</p>}
    </section>
  );
}
