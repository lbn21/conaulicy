"use client";

import { useWarsawToday } from "@/components/warsaw-today";
import { capitalised, dayLead, relativeDay, relativeWord } from "@/lib/dates";

// „Dziś”, „Jutro” and „Za 5 dni”, rendered with the page, for the server's
// Warsaw day, then kept to the device's (components/warsaw-today.tsx). The
// dates around the word are absolute, with their weekday.

/**
 * lead: a section's first line, „Dziś: ”, „Jutro: ” or „Za 5 dni: ” before
 * `text`, else `text` capitalised (lib/dates.ts dayLead). word: „dziś, ”
 * or „jutro, ” before the date that follows, else nothing. label: „Dziś” or
 * „Jutro” and `afterWord`, else `text`. title: „ · ” and Intl's relative
 * day („dzisiaj”, „jutro”, „za 6 dni”), after a timeline card's date, body-s,
 * regular and grey (site.scss .app-timeline__when, tasks 268-269), else nothing.
 */
type Form = "lead" | "word" | "label" | "title";

type Props = {
  /** The Warsaw day, "2026-11-03". */
  day: string;
  form: Form;
  /** The absolute text („wtorek, 3 listopada”) for lead and label. */
  text?: string;
  /** label: what follows „Dziś” or „Jutro” (never `text`). */
  afterWord?: string;
};

/** A day's relative word (see Form). */
export function DayWord({ day, form, text = "", afterWord = "" }: Props) {
  const today = useWarsawToday();
  if (form === "lead") return dayLead(day, text, today);
  // No server day (outside WarsawToday) and not yet the device's: no word.
  if (form === "title")
    return today ? (
      <span className="govuk-!-font-size-16 govuk-!-font-weight-regular app-timeline__when">{` · ${relativeDay(day, today)}`}</span>
    ) : null;
  const word = today ? relativeWord(day, today) : null;
  if (form === "word") return word ? `${word}, ` : null;
  return word ? `${capitalised(word)}${afterWord}` : text;
}
