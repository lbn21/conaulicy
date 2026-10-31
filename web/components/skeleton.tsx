// What a screen reader hears in place of content still loading, once per
// placeholder, visually hidden (govuk-visually-hidden). No live region and
// no aria-busy: a live region announces changes, not what is there on load,
// and aria-busy marks an element being updated in place
// (developer.mozilla.org/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-busy),
// while a fallback is replaced, not updated.
export const LOADING = "Sprawdzamy…";

/**
 * `text` as blank space of about its width: each letter an en space
 * (U+2002, half an em, about a letter of the site's font), its spaces kept
 * so it wraps as the text would. Blank, so a reader that ignores CSS and
 * aria-hidden (a crawler, a text-only browser) finds no words in a
 * placeholder.
 */
export const blank = (text: string) => text.replace(/\S/gu, "\u2002");

/**
 * A loading placeholder (GOV.UK has none): blank space as wide as the text
 * that will typically be there (`children`), in the element and typography
 * it will have, painted as a grey bar (app-skeleton, GOV.UK's light grey),
 * so it takes the space the content typically will, line for line, and
 * scales with text zoom. A subtle pulse (opacity only), none under
 * prefers-reduced-motion (app/site.scss). Hidden from assistive technology;
 * pair it with LOADING.
 */
export function Skeleton({ children }: { children: string }) {
  return (
    <span className="app-skeleton" aria-hidden="true">
      {blank(children)}
    </span>
  );
}
