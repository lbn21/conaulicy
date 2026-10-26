export type Crumb = { href: string; label: string };

/** Every subpage's first crumb: the home page. */
export const HOME_CRUMB: Crumb = { href: "/", label: "Strona główna" };

/**
 * GOV.UK's breadcrumbs, every item a link and the page itself left out.
 * Not on the home page or an error page (GOV.UK). The first thing in
 * <main> (the layout's), above the h1, on every subpage
 * (docs/layout.md): its own margin-top gives way to main's padding, and its
 * margin-bottom adds main's: GOV.UK's 30/50 px to what follows.
 */
export function Breadcrumbs({ items }: { items: readonly Crumb[] }) {
  return (
    <nav
      className="govuk-breadcrumbs govuk-!-margin-top-0 govuk-!-margin-bottom-8"
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
