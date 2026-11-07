"use client";

import type { ReactNode } from "react";
import { useWarsawToday } from "@/components/warsaw-today";
import { capitalised, relativeWord } from "@/lib/dates";

// A day of „Najbliższe dni”'s timeline (components/upcoming.tsx, task
// 261): its marker and its date first, so a screen reader hears the day
// before what happens on it. „Dziś” and „Jutro”, and which day is today
// (its marker), follow the device's day as DayWord does
// (components/day-word.tsx); every other word is the server's.

/** A day's words, made on the server (lib/dates.ts dayFace). */
export type DayLabel = {
  /** The Warsaw day, "2026-11-10". */
  day: string;
  /** "wtorek". */
  weekday: string;
  /** "10". */
  date: string;
  /** "listopada". */
  month: string;
};

const word = (label: DayLabel, today: string) =>
  today ? relativeWord(label.day, today) : null;

const dayClass = (empty: boolean, today: boolean) =>
  `app-timeline__day${empty ? " app-timeline__day--empty" : ""}${today ? " app-timeline__day--today" : ""}`;

/**
 * A day with something on it: its heading („Dziś” and its date in
 * secondary text, else the weekday and the date), then its cards.
 */
export function TimelineDay({
  label,
  children,
}: {
  label: DayLabel;
  children: ReactNode;
}) {
  const today = useWarsawToday();
  const w = word(label, today);
  const date = `${label.date} ${label.month}`;
  return (
    <li className={dayClass(false, w === "dziś")}>
      <h3 className="govuk-heading-s govuk-!-margin-bottom-2">
        <time dateTime={label.day}>
          {capitalised(w ?? label.weekday)}
          <span className="govuk-visually-hidden">,</span>{" "}
          <span className="govuk-hint">
            {w ? `${label.weekday}, ${date}` : date}
          </span>
        </time>
      </h3>
      {children}
    </li>
  );
}

/**
 * One or more days with nothing on them, one low line: „Środa, 11
 * listopada · nic zaplanowanego”, or a run, „Czwartek 12 – sobota 14
 * listopada · nic zaplanowanego” (the first month left out when the same).
 */
export function EmptyDays({ from, to }: { from: DayLabel; to: DayLabel }) {
  const today = useWarsawToday();
  const first = word(from, today);
  const last = word(to, today);
  const one = from.day === to.day;
  const start = first
    ? capitalised(first)
    : one
      ? `${capitalised(from.weekday)}, ${from.date} ${from.month}`
      : `${capitalised(from.weekday)} ${from.date}${from.month === to.month ? "" : ` ${from.month}`}`;
  const end = last ?? `${to.weekday} ${to.date} ${to.month}`;
  return (
    <li className={dayClass(true, first === "dziś")}>
      <p className="govuk-hint govuk-!-margin-bottom-0">
        <time dateTime={from.day}>{start}</time>
        {!one && (
          <>
            {" – "}
            <time dateTime={to.day}>{end}</time>
          </>
        )}
        <span aria-hidden="true"> · </span>
        <span className="govuk-visually-hidden">: </span>
        nic zaplanowanego
      </p>
    </li>
  );
}
