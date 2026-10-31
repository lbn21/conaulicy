"use client";

import { Suspense, use, useSyncExternalStore } from "react";
import { browser } from "react-dom";
import { Skeleton } from "@/components/skeleton";
import { relativeWord, todayInWarsaw } from "@/lib/dates";
import { capitalised, dayLead } from "@/lib/upcoming";

// „Dziś”, „Jutro” and „Za 5 dni” come from the device's date, never from
// the server: the pages around them are static, cached until the next
// deploy or import, so a server's „dziś” would go wrong overnight. React's
// browser() renders the word only in the browser: on the server, and so in
// the prerendered shell, use(browser()) leaves the closest <Suspense>
// fallback, a word-wide skeleton (react.dev/reference/react-dom/browser;
// nextjs.org/docs/app/guides/single-page-applications, "Rendering
// components only in the browser"). The dates around the word are always
// in the HTML, absolute, with their weekday. Re-checked every minute and
// when the tab comes back, so a tab left open past midnight moves „Jutro”
// to „Dziś”.

function subscribe(onChange: () => void): () => void {
  const timer = setInterval(onChange, 60_000);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onChange);
  };
}

/**
 * lead: a section's first line, „Dziś: ”, „Jutro: ” or „Za 5 dni: ” before
 * `text`, else `text` capitalised (lib/upcoming.ts dayLead). word: „dziś, ”
 * or „jutro, ” before the date that follows, else nothing. label: „Dziś” or
 * „Jutro” and `afterWord`, else `text`.
 */
type Form = "lead" | "word" | "label";

type Props = {
  /** The Warsaw day, "2026-11-03". */
  day: string;
  form: Form;
  /** The absolute text („wtorek, 3 listopada”) for lead and label. */
  text?: string;
  /** label: what follows „Dziś” or „Jutro” (never `text`). */
  afterWord?: string;
};

function Word({ day, form, text = "", afterWord = "" }: Props) {
  use(browser("„Dziś” and „jutro” come from the device's date."));
  // Rendered in the browser only (above), so it never needs a server snapshot.
  const today = useSyncExternalStore(subscribe, () => todayInWarsaw());
  if (form === "lead") return dayLead(day, text, today);
  const word = relativeWord(day, today);
  if (form === "word") return word ? `${word}, ` : null;
  return word ? `${capitalised(word)}${afterWord}` : text;
}

// What the skeleton stands for: about one word, in the place it will take.
const PLACEHOLDER: Record<Form, string> = {
  lead: "Jutro:",
  word: "jutro,",
  label: "Jutro",
};

/** A day's relative word (see Form), from the device's date. */
export function DayWord(props: Props) {
  const { form, text = "" } = props;
  return (
    <Suspense
      fallback={
        <>
          <Skeleton>{PLACEHOLDER[form]}</Skeleton>
          {form === "lead" ? ` ${text}` : form === "word" ? " " : null}
        </>
      }
    >
      <Word {...props} />
    </Suspense>
  );
}
