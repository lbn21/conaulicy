"use client";

import { useEffect } from "react";

// Loads GOV.UK Frontend's JS after the page has rendered, in its own chunk,
// so it never delays the first paint. Pages are plain links (full loads), so
// one run per page is enough.
export function GovukFrontend() {
  useEffect(() => {
    void import("@/lib/govuk-frontend").then((m) => m.initGovukFrontend());
  }, []);
  return null;
}
