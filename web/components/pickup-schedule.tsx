"use client";

import { useSyncExternalStore } from "react";
import { Bins } from "@/components/waste-bins";
import { absoluteDay, dayFace, relativeWord, todayInWarsaw } from "@/lib/dates";
import type { PickupDay } from "@/lib/schedule";
import {
  NO_MORE_DATES,
  NO_MORE_DATES_NEXT,
  putOutNote,
} from "@/lib/schedule-notes";

const HERO_COUNT = 3;

// Re-check the Warsaw day every minute and when the tab comes back, so a tab
// left open overnight moves "jutro" to "dziś". React only re-renders when the
// date string changes.
function subscribe(onChange: () => void): () => void {
  const timer = setInterval(onChange, 60_000);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onChange);
  };
}

function spokenDay(iso: string, today: string): string {
  const absolute = absoluteDay(iso);
  const relative = relativeWord(iso, today);
  return relative ? `${relative}, ${absolute}` : absolute;
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
function NextPickup({ day, today }: { day: PickupDay; today: string }) {
  const relative = relativeWord(day.date, today);
  const face = dayFace(day.date);
  return (
    <div className="govuk-!-margin-bottom-6">
      <h3 className="govuk-heading-s govuk-!-margin-bottom-3">
        <time dateTime={day.date}>
          <span className="govuk-visually-hidden">
            Najbliższy odbiór: {spokenDay(day.date, today)}
          </span>
          <span aria-hidden="true">
            <span className="govuk-!-display-block govuk-!-font-size-27">
              {relative ?? "Najbliższy odbiór"}
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
function DayList({ days, today }: { days: PickupDay[]; today: string }) {
  return (
    <dl className="govuk-summary-list">
      {days.map((day) => (
        <div key={day.date} className="govuk-summary-list__row">
          <dt className="govuk-summary-list__key">
            <time dateTime={day.date}>{spokenDay(day.date, today)}</time>
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
  // Hydrates with the server's day, so "dziś"/"jutro" is in the HTML with no
  // pop-in. Re-renders only if the Warsaw day has moved on since the render
  // (a cached page across midnight).
  const today = useSyncExternalStore(
    subscribe,
    todayInWarsaw,
    () => renderedOn,
  );
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
      <NextPickup day={hero[0]} today={today} />
      {hero.length > 1 && <DayList days={hero.slice(1)} today={today} />}
      {rest.length > 0 && (
        <details className="govuk-details">
          <summary className="govuk-details__summary">
            <span className="govuk-details__summary-text">
              Pokaż więcej terminów
            </span>
          </summary>
          <div className="govuk-details__text">
            <DayList days={rest} today={today} />
          </div>
        </details>
      )}
      {later && <p className="govuk-body">{later}</p>}
    </section>
  );
}
