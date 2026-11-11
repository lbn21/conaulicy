import { PlaceLink } from "@/components/place-link";

export type Crumb = { href: string; label: string };

/** The first crumb: the home page. */
export const HOME_CRUMB: Crumb = { href: "/", label: "Strona główna" };

/** The trail's classes, its skeleton's too (components/place-suspense.tsx). */
export const CRUMBS_CLASS =
  "govuk-breadcrumbs govuk-breadcrumbs--collapse-on-mobile govuk-!-margin-top-7 govuk-!-margin-bottom-7";

/**
 * GOV.UK's breadcrumbs, every item a link and the page itself left out.
 * Only on the address pages: the rest of the site is flat (GOV.UK: none on
 * a flat site, the home page or an error page). Before the layout's one
 * <main>, from its @breadcrumbs slot (app/layout.tsx,
 * components/place-crumbs.tsx), as GOV.UK places them, so the skip link
 * skips them (docs/layout.md). One token above and below (spacing 7: 25 px
 * on mobile, 40 from tablet), so the trail sits centred between the header
 * and the page head's band: its margin-top stands in for main's padding
 * above it, and the band cancels main's padding below it (site.scss
 * .app-band), so the gap below is the margin-bottom alone. Collapsed on mobile (GOV.UK's modifier: the first and last
 * crumb on one line, a long one wrapping after its chevron), so a chevron
 * never starts a line on its own.
 */
export function Breadcrumbs({ items }: { items: readonly Crumb[] }) {
  return (
    <nav className={CRUMBS_CLASS} aria-label="Ścieżka nawigacyjna">
      <ol className="govuk-breadcrumbs__list">
        {items.map(({ href, label }) => (
          <li key={href} className="govuk-breadcrumbs__list-item">
            <PlaceLink className="govuk-breadcrumbs__link" href={href}>
              {label}
            </PlaceLink>
          </li>
        ))}
      </ol>
    </nav>
  );
}
