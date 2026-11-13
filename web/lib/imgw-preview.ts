// Preview and development only: /podglad/imgw/<scenario> shows IMGW's
// warnings from the mock (lib/imgw-mock.ts) as the address page draws
// them, so a Preview can be reviewed, and CI's check-warnings can check
// every state, on the static build. Never in production: there the route
// has no pages (its generateStaticParams is empty), so every scenario is
// the prerendered 404, and the mock refuses to answer anyway.

/** Each scenario's mock upstream (lib/imgw-mock.ts STARTS, levels 1-3). */
export const IMGW_SCENARIOS: Record<string, string> = {
  "l1-active": "mock:1809?level=1",
  "l1-upcoming": "mock:1809?level=1&start=upcoming",
  "l2-active": "mock:1809?level=2",
  "l2-upcoming": "mock:1809?level=2&start=upcoming",
  "l3-active": "mock:1809?level=3",
  "l3-upcoming": "mock:1809?level=3&start=upcoming",
  "two-l2-l3": "mock:1809?level=2&also=3",
  "three-l1-l2-l3": "mock:1809?level=1&also=2,3",
  "cross-day-upcoming": "mock:1809?level=2&start=night",
  // IMGW's checks failing for 70 minutes: the warning still shown, and
  // none to show.
  failing: "mock:1809?level=2&failingAgo=70",
  "failing-none": "mock:none?failingAgo=70",
  // The store cannot be read: an expected error, rendered as a notice.
  unreadable: "mock:1809?fail=500",
};

/** The route's pages: every scenario, none in production. */
export function imgwPreviewParams(
  env: Record<string, string | undefined> = process.env,
): Array<{ scenario: string }> {
  if (env.VERCEL_ENV === "production") return [];
  return Object.keys(IMGW_SCENARIOS).map((scenario) => ({ scenario }));
}
