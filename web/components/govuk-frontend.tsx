"use client";

import { useEffect } from "react";

// Loads GOV.UK Frontend's JS after the page has rendered, in its own chunk,
// so it never delays the first paint. Pages are plain links (full loads), so
// one run per page is enough. The search's own navigations (to /szukaj or a
// place, components/address-search.tsx) are client-side, so a page reached
// that way keeps its GOV.UK buttons unstarted: harmless there, as GOV.UK's
// Button script only handles data-prevent-double-click (never set) and
// role="button" links (only the calendar links, on the module subpages,
// which are reached by plain links).
export function GovukFrontend() {
  useEffect(() => {
    void import("@/lib/govuk-frontend").then((m) => m.initGovukFrontend());
  }, []);
  return null;
}
