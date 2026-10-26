export type Crumb = { href: string; label: string };

/** The first crumb: the home page. */
export const HOME_CRUMB: Crumb = { href: "/", label: "Strona główna" };

/**
 * GOV.UK's breadcrumbs, every item a link and the page itself left out.
 * Only on the address pages: the rest of the site is flat (GOV.UK: none on
 * a flat site, the home page or an error page). Before <main>
 * (components/page-main.tsx), as GOV.UK places them, so the skip link skips
 * them (docs/layout.md). Its margin-top stands in for main's padding above
 * it; GOV.UK's own margin-bottom (10 px) and main's padding make the gap to
 * what follows.
 */
export function Breadcrumbs({ items }: { items: readonly Crumb[] }) {
  return (
    <nav
      className="govuk-breadcrumbs govuk-!-margin-top-7"
      aria-label="Ścieżka nawigacyjna"
    >
      <ol className="govuk-breadcrumbs__list">
        {items.map(({ href, label }) => (
          <li key={href} className="govuk-breadcrumbs__list-item">
            <a className="govuk-breadcrumbs__link" href={href}>
              {label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
