import type { Metadata } from "next";

/** Its H1 and title (GOV.UK: "Page not found"). */
const NOT_FOUND_TITLE = "Nie znaleziono strony";

/**
 * Every 404's metadata: its title, no description (never the layout's
 * waste blurb), and Next.js's own noindex as the only robots tag (without
 * the layout's index/follow tag next to it).
 */
export const NOT_FOUND_METADATA: Metadata = {
  title: NOT_FOUND_TITLE,
  description: null,
  robots: null,
};

/**
 * GOV.UK's page not found pattern
 * (design-system.service.gov.uk/patterns/page-not-found-pages), for every
 * 404: an unknown path and an unknown address alike.
 */
export function PageNotFound() {
  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <h1 className="govuk-heading-l">{NOT_FOUND_TITLE}</h1>
        <p className="govuk-body">
          Nie ma takiej strony. Może w adresie jest literówka albo link jest
          nieaktualny.
        </p>
        <p className="govuk-body">
          <a href="/" className="govuk-link">
            Przejdź na stronę główną
          </a>
        </p>
      </div>
    </div>
  );
}
