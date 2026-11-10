"use client";

import {
  createContext,
  type ReactNode,
  use,
  useSyncExternalStore,
} from "react";
import { todayInWarsaw } from "@/lib/dates";

// The Warsaw day for what an address page shows from today on: „Dziś” and
// „Jutro” (components/day-word.tsx) and the waste dates
// (components/pickup-schedule.tsx). The page is
// read per request (components/hub.tsx hubData), so the server renders it
// for its day, given here by WarsawToday from the same read; the words are
// in the HTML with the rest of the page. A page can outlive its day: a tab
// left open past midnight, one back from the browser's back/forward cache,
// or the router's cached payload. So the device's day takes over: on
// hydration React keeps the server's day (getServerSnapshot), then
// re-renders only if the device's differs; a page mounted in the browser
// starts from the device's day; and it is re-checked every minute, when the
// tab comes back and when the page is restored
// (react.dev/reference/react/useSyncExternalStore;
// react.dev/reference/react/createContext;
// nextjs.org/docs/app/getting-started/server-and-client-components#context-providers;
// developer.mozilla.org/docs/Web/API/Window/pageshow_event).

const ServerDay = createContext("");

function subscribe(onChange: () => void): () => void {
  const timer = setInterval(onChange, 60_000);
  document.addEventListener("visibilitychange", onChange);
  window.addEventListener("pageshow", onChange);
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onChange);
    window.removeEventListener("pageshow", onChange);
  };
}

/** The server's Warsaw day (`day`, "2026-11-03") for what it holds. */
export function WarsawToday({
  day,
  children,
}: {
  day: string;
  children?: ReactNode;
}) {
  return <ServerDay value={day}>{children}</ServerDay>;
}

/** Today in Warsaw: the server's (WarsawToday) until hydrated, then the device's. */
export function useWarsawToday(): string {
  const server = use(ServerDay);
  return useSyncExternalStore(subscribe, todayInWarsaw, () => server);
}
