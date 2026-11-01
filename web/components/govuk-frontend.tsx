"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Loads GOV.UK Frontend's JS after the page has rendered, in its own chunk,
// so it never delays the first paint, and starts the components of every
// page a client-side navigation brings in (next/link, the search's
// router.push): the layout stays, so this runs again on each new path
// (nextjs.org/docs/app/api-reference/functions/use-pathname, "Do something
// in response to a route change"). A component already started is skipped
// (lib/govuk-frontend.ts). The error summary the search draws is started by
// the search itself. In a <Suspense> in the layout: on a path not
// prerendered (a house number), usePathname waits for the request.
export function GovukFrontend() {
  const pathname = usePathname();
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs again on each new path, as the docs' route-change example
  useEffect(() => {
    void import("@/lib/govuk-frontend").then((m) => m.initGovukFrontend());
  }, [pathname]);
  return null;
}
