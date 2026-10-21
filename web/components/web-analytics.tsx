"use client";

import { useEffect } from "react";

// Vercel Web Analytics: anonymous page views and two events, no cookies
// (see /prywatnosc). Production deployments only; the library and its script
// load once the page has loaded and the browser is idle (or on the first
// tracked click), so they never compete with the first paint or hydration.
// No query string or hash ever leaves the page (?nr=, ?q=).
//
// Events come from links marked in server-rendered HTML:
//   data-event="calendar_add" data-zone="…" data-source="street"
//   data-event="pdf_open" data-zone="…"

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

function onClick(event: MouseEvent) {
  const link =
    event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-event]")
      : null;
  const name = link?.dataset.event;
  if (!name) return;
  const { zone, source } = link.dataset;
  void start().then((m) => m.track(name, source ? { zone, source } : { zone }));
}

export function WebAnalytics({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    let idle = 0;
    const later = () => {
      idle = window.requestIdleCallback
        ? window.requestIdleCallback(() => void start(), { timeout: 5000 })
        : window.setTimeout(() => void start(), 2000);
    };
    if (document.readyState === "complete") later();
    else window.addEventListener("load", later, { once: true });
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("load", later);
      window.cancelIdleCallback?.(idle);
      document.removeEventListener("click", onClick);
    };
  }, [enabled]);
  return null;
}
