import type { ReactNode } from "react";

// What a screen reader hears in place of content still loading, once per
// placeholder, visually hidden (govuk-visually-hidden). No live region and
// no aria-busy: a live region announces changes, not what is there on load,
// and aria-busy marks a live region mid-update
// (developer.mozilla.org/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-busy),
// while a fallback is replaced, not updated.
export const LOADING = "Sprawdzamy…";

/**
 * A loading placeholder (GOV.UK has none): the text that will be there, in
 * the element and typography it will have, painted as a grey bar
 * (app-skeleton: transparent text on GOV.UK's light grey), so it takes the
 * space the content will, line for line. Hidden from assistive technology;
 * pair it with LOADING. Never animated, so nothing moves under
 * prefers-reduced-motion either.
 */
export function Skeleton({ children }: { children: ReactNode }) {
  return (
    <span className="app-skeleton" aria-hidden="true">
      {children}
    </span>
  );
}
