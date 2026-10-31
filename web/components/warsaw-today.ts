"use client";

import { useSyncExternalStore } from "react";
import { todayInWarsaw } from "@/lib/dates";

// The Warsaw day on the device, for what a cached page shows from today on
// (the waste dates: components/pickup-schedule.tsx, the address page's
// next pickup). Hydrated with the day the server rendered for, so the HTML
// matches; then the device's, re-checked every minute and when the tab
// comes back. React re-renders only when the day string changes
// (react.dev/reference/react/useSyncExternalStore, getServerSnapshot).

function subscribe(onChange: () => void): () => void {
  const timer = setInterval(onChange, 60_000);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onChange);
  };
}

/** Today in Warsaw: `renderedOn` (the server's day) until hydrated. */
export function useWarsawToday(renderedOn: string): string {
  return useSyncExternalStore(
    subscribe,
    () => todayInWarsaw(),
    () => renderedOn,
  );
}
