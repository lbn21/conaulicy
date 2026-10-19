"use client";

import { inject, track } from "@vercel/analytics";
import { useEffect } from "react";

// Vercel Web Analytics: anonymous page views and two events, no cookies
// (see /prywatnosc). Production deployments only; the script loads once the
// page has loaded and the browser is idle, so it never competes with the
// first paint. No query string or hash ever leaves the page (?nr=, ?q=).
//
// Events come from links marked in server-rendered HTML:
//   data-event="calendar_add" data-zone="…" data-source="street"
//   data-event="pdf_open" data-zone="…"

let injected = false;

function start() {
  if (injected) return;
  injected = true;
  inject({
    mode: "production",
    beforeSend: (event) => ({ ...event, url: event.url.split(/[?#]/)[0] }),
  });
}

function onClick(event: MouseEvent) {
  const link =
    event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-event]")
      : null;
  if (!link?.dataset.event) return;
  start();
  const { zone, source } = link.dataset;
  track(link.dataset.event, source ? { zone, source } : { zone });
}

export function WebAnalytics({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    let idle = 0;
    const later = () => {
      idle = window.requestIdleCallback
        ? window.requestIdleCallback(start, { timeout: 5000 })
        : window.setTimeout(start, 2000);
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
