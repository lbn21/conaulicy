"use client";

import {
  Analytics,
  type BeforeSendEvent,
  track,
} from "@vercel/analytics/react";
import { useEffect, useRef, useState } from "react";
import { whenIdle } from "@/lib/idle";

// Vercel Web Analytics: anonymous page views and three events, no cookies
// (see /prywatnosc). Production deployments only. <Analytics /> mounts, and
// so loads its script, once the page has loaded and the browser is idle (or
// on the first tracked click), so it never competes with the first paint or
// hydration. The React component, not @vercel/analytics/next: that one adds
// a route to every page view. No query string or hash ever leaves the page
// (?nr=, ?q=).
//
// Events come from links marked in server-rendered HTML:
//   data-event="calendar_add" data-zone="…" data-source="street"
//   data-event="water_calendar_add" data-place="<place id>"
//   data-event="pdf_open" data-zone="…"
// Each sends whichever of zone, source and place its link has.

type Tracked = [name: string, properties: Record<string, string>];

function withoutQuery(event: BeforeSendEvent): BeforeSendEvent {
  return { ...event, url: event.url.split(/[?#]/)[0] };
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

export function WebAnalytics({ enabled }: { enabled: boolean }) {
  const [ready, setReady] = useState(false);
  // track() drops an event until <Analytics /> has set up its queue, so a
  // click before that waits here for the effect below.
  const mounted = useRef(false);
  const early = useRef<Tracked[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let cancelIdle = () => {};
    const later = () => {
      cancelIdle = whenIdle(() => setReady(true), 5000, 2000);
    };
    if (document.readyState === "complete") later();
    else window.addEventListener("load", later, { once: true });
    const onClick = (event: MouseEvent) => {
      const link =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-event]")
          : null;
      const name = link?.dataset.event;
      if (!name) return;
      const properties = eventProperties(link.dataset);
      if (mounted.current) track(name, properties);
      else {
        early.current.push([name, properties]);
        setReady(true);
      }
    };
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("load", later);
      cancelIdle();
      document.removeEventListener("click", onClick);
    };
  }, [enabled]);

  // Runs after <Analytics /> has mounted: a child's effects run first.
  useEffect(() => {
    if (!ready) return;
    mounted.current = true;
    for (const [name, properties] of early.current.splice(0))
      track(name, properties);
  }, [ready]);

  return ready ? (
    <Analytics mode="production" beforeSend={withoutQuery} />
  ) : null;
}
