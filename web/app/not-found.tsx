import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Nie ma takiej strony",
};

export default function NotFound() {
  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <h1 className="govuk-heading-l">Nie ma takiej strony</h1>
        <p className="govuk-body">
          Może adres ma literówkę albo strona zniknęła. Wpisz ulicę jeszcze raz
          na stronie głównej.
        </p>
        <p className="govuk-body">
          <a href="/" className="govuk-link">
            Wróć na stronę główną
          </a>
        </p>
      </div>
    </div>
  );
}
