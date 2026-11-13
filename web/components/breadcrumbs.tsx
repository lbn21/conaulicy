import { PlaceLink } from "@/components/place-link";

export type Crumb = { href: string; label: string };

/** The first crumb: the home page. */
export const HOME_CRUMB: Crumb = { href: "/", label: "Strona główna" };

/** The trail's classes, its skeleton's too (components/place-suspense.tsx). */
export const CRUMBS_CLASS =
  "govuk-breadcrumbs govuk-breadcrumbs--collapse-on-mobile";

/**
 * GOV.UK's breadcrumbs, every item a link and the page itself left out.
 * Only on the address pages: the rest of the site is flat (GOV.UK: none on
 * a flat site, the home page or an error page). The first line of the
 * page head's band (components/page-head.tsx `crumbs`, from
 * components/place-page.tsx AddressPage), so the band runs unbroken from
 * the header (t400, docs/layout.md): standard, not inverse, on the band's
 * tint. Centred between the header and the band's next line: the band's
 * top padding above it, the same token below it (site.scss .app-band).
 * Collapsed on mobile (GOV.UK's modifier: the first and last crumb on one
 * line, a long one wrapping after its chevron), so a chevron never starts
 * a line on its own.
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
