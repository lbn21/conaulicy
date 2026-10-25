"use client";

import { useEffect } from "react";
import { whenIdle } from "@/lib/idle";

// Vercel Web Analytics: anonymous page views and three events, no cookies
// (see /prywatnosc). Production deployments only; the library and its script
// load once the page has loaded and the browser is idle (or on the first
// tracked click), so they never compete with the first paint or hydration.
// No query string or hash ever leaves the page (?nr=, ?q=).
//
// Events come from links marked in server-rendered HTML:
//   data-event="calendar_add" data-zone="…" data-source="street"
//   data-event="water_calendar_add" data-place="<place id>"
//   data-event="pdf_open" data-zone="…"
// Each sends whichever of zone, source and place its link has.

let analytics: Promise<typeof import("@vercel/analytics")> | undefined;

function start() {
  analytics ??= import("@vercel/analytics").then((m) => {
    m.inject({
      mode: "production",
      beforeSend: (event) => ({ ...event, url: event.url.split(/[?#]/)[0] }),
    });
    return m;
  });
  return analytics;
}

/** Whichever of zone, source and place a tracked link has. */
export function eventProperties({
  zone,
  source,
  place,
}: DOMStringMap): Record<string, string> {
  return Object.fromEntries(
    Object.entries({ zone, source, place }).filter(
      (entry): entry is [string, string] => Boolean(entry[1]),
    ),
  );
}

function onClick(event: MouseEvent) {
  const link =
    event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-event]")
      : null;
  const name = link?.dataset.event;
  if (!name) return;
  void start().then((m) => m.track(name, eventProperties(link.dataset)));
}

export function WebAnalytics({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    let cancelIdle = () => {};
    const later = () => {
      cancelIdle = whenIdle(() => void start(), 5000, 2000);
    };
    if (document.readyState === "complete") later();
    else window.addEventListener("load", later, { once: true });
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("load", later);
      cancelIdle();
      document.removeEventListener("click", onClick);
    };
  }, [enabled]);
  return null;
}
