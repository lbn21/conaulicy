"use client";

import { usePageDay } from "@/components/page-day";
import {
  addDays,
  capitalised,
  dayLead,
  relativeDay,
  relativeWord,
} from "@/lib/dates";

// „Dziś”, „Jutro” and „Za 5 dni”, rendered with the page, for the Warsaw
// day it was rendered for (components/page-day.tsx). The dates around the
// word are absolute, with their weekday.

/**
 * lead: a section's first line, „Dziś: ”, „Jutro: ” or „Za 5 dni: ” before
 * `text`, else `text` capitalised (lib/dates.ts dayLead). word: „dziś, ”
 * or „jutro, ” before the date that follows, else nothing. label: „Dziś” or
 * „Jutro”, else `text`. title: Intl's relative day („Dzisiaj”, „Jutro”,
 * „Za 6 dni”) as a badge after a timeline card's date (site.scss
 * .app-badge), strong for today and tomorrow (their only emphasis, t385),
 * muted for later; a comma before it for screen
 * readers only; else nothing.
 */
type Form = "lead" | "word" | "label" | "title";

type Props = {
  /** The Warsaw day, "2026-11-03". */
  day: string;
  form: Form;
  /** The absolute text („wtorek, 3 listopada”) for lead and label. */
  text?: string;
};

/** A day's relative word (see Form). */
export function DayWord({ day, form, text = "" }: Props) {
  const today = usePageDay();
  if (form === "lead") return dayLead(day, text, today);
  // No page day (outside PageDay): no word.
  if (form === "title")
    return today ? (
      <>
        <span className="govuk-visually-hidden">, </span>{" "}
        <span
          className={
            day <= addDays(today, 1)
              ? "app-badge app-badge--strong"
              : "app-badge"
          }
        >
          {capitalised(relativeDay(day, today))}
        </span>
      </>
    ) : null;
  const word = today ? relativeWord(day, today) : null;
  if (form === "word") return word ? `${word}, ` : null;
  return word ? capitalised(word) : text;
}
