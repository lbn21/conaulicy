import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "O projekcie",
  alternates: { canonical: "/o-projekcie" },
};

export default function AboutPage() {
  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <h1 className="govuk-heading-l">O projekcie</h1>
        <p className="govuk-body-l">
          conaulicy.pl to prosta strona dla Lubaczowa i okolicznych wsi:
          wpisujesz ulicę albo wieś i od razu widzisz, kiedy przyjedzie
          śmieciarka.
        </p>
        <p className="govuk-body">
          Strona jest darmowa i niekomercyjna. Nie ma na niej reklam ani kont.
        </p>
        <p className="govuk-body">
          Zrobił ją Jakub Marciniszyn dla mieszkańców Lubaczowa.
        </p>
        <p className="govuk-body">
          Terminy przepisujemy z harmonogramów miasta Lubaczów i gminy Lubaczów.
          Przy każdym adresie podajemy źródło i datę, kiedy je sprawdziliśmy.
        </p>
        <p className="govuk-body">
          Nie jesteśmy urzędem. Gdyby coś się nie zgadzało, rację ma harmonogram
          gminy.
        </p>
        <p className="govuk-body">
          Jak dbamy o Twoją prywatność, opisujemy w zakładce{" "}
          <a href="/prywatnosc" className="govuk-link">
            Prywatność
          </a>
          , a o wygodę korzystania – w zakładce{" "}
          <a href="/dostepnosc" className="govuk-link">
            Dostępność
          </a>
          .
        </p>
      </div>
    </div>
  );
}
