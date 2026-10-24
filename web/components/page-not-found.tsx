import { ContactLink } from "@/components/contact-link";
import { HOME_H1 } from "@/lib/share";

/** Its H1 and title (GOV.UK: "Page not found"). */
export const NOT_FOUND_TITLE = "Nie znaleziono strony";

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
          Jeśli adres został wpisany ręcznie, sprawdź, czy jest poprawny.
        </p>
        <p className="govuk-body">
          Jeśli adres został wklejony, sprawdź, czy skopiowano go w całości.
        </p>
        <p className="govuk-body">
          Jeśli adres jest poprawny albo kliknięto link lub przycisk, napisz do
          nas: <ContactLink />
        </p>
        <p className="govuk-body">
          <a href="/" className="govuk-link">
            {HOME_H1}
          </a>
        </p>
      </div>
    </div>
  );
}
