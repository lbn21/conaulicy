"use client";

import { createContext, type ReactNode, use } from "react";

// The Warsaw day a page was rendered for: „Dziś” and „Jutro”
// (components/day-word.tsx) and the waste dates from today on
// (components/pickup-schedule.tsx). Every page is prerendered whole, its
// words in the HTML; the first cron run after midnight re-renders the
// pages whose words moved (lib/page-refresh.ts). No recompute on the device: the page
// never changes after it is drawn.

const Day = createContext("");

/** The page's Warsaw day (`day`, "2026-11-03") for what it holds. */
export function PageDay({
  day,
  children,
}: {
  day: string;
  children?: ReactNode;
}) {
  return <Day value={day}>{children}</Day>;
}

/** The page's Warsaw day (PageDay); "" outside one. */
export function usePageDay(): string {
  return use(Day);
}
