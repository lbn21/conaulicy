"use client";

import { useSyncExternalStore } from "react";
import { Skeleton } from "@/components/skeleton";
import { relativeWord, todayInWarsaw } from "@/lib/dates";
import { capitalised, dayLead } from "@/lib/upcoming";

// „Dziś”, „Jutro” and „Za 5 dni” come from the device's date, never from
// the server: the pages around them are static, cached until the next
// deploy or import, so a server's „dziś” would go wrong overnight. The
// device's day is an external store with no server value
// (react.dev/reference/react/useSyncExternalStore, getServerSnapshot): on
// the server, and so in the prerendered shell, and at hydration, the word
// is a word-wide skeleton; right after hydration, the word. The dates around
// the word are always in the HTML, absolute, with their weekday. Not
// use(browser()) (task 228): Next.js's docs keep it for a first browser
// render that cannot match the server's HTML, which this one does, and its
// client-only boundary deferred the whole place behind the address pages'
// <Suspense> (components/place-params.tsx) to request time. Re-checked
// every minute and when the tab comes back, so a tab left open past
// midnight moves „Jutro” to „Dziś”.

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

// What the skeleton stands for: about one word, in the place it will take.
const PLACEHOLDER: Record<Form, string> = {
  lead: "Jutro:",
  word: "jutro,",
  label: "Jutro",
};

// No day on the server: the skeleton.
const serverDay = () => null;

/** A day's relative word (see Form), from the device's date. */
export function DayWord({ day, form, text = "", afterWord = "" }: Props) {
  const today = useSyncExternalStore(subscribe, todayInWarsaw, serverDay);
  if (today === null) {
    return (
      <>
        <Skeleton>{PLACEHOLDER[form]}</Skeleton>
        {form === "lead" ? ` ${text}` : form === "word" ? " " : null}
      </>
    );
  }
  if (form === "lead") return dayLead(day, text, today);
  const word = relativeWord(day, today);
  if (form === "word") return word ? `${word}, ` : null;
  return word ? `${capitalised(word)}${afterWord}` : text;
}
