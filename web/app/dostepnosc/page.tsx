import type { Metadata } from "next";
import { pageMetadata } from "@/lib/share";

export const metadata: Metadata = pageMetadata({
  path: "/dostepnosc",
  title: "Dostępność",
  description:
    "Chcemy, żeby z conaulicy.pl wygodnie korzystał każdy: duży tekst, mocny kontrast, obsługa klawiaturą. Co już sprawdzamy, a czego jeszcze nie.",
});

export default function AccessibilityPage() {
  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <h1 className="govuk-heading-l">Dostępność</h1>
        <p className="govuk-body-l">
          Chcemy, żeby z tej strony wygodnie korzystał każdy: osoby starsze,
          słabiej widzące, korzystające z czytnika ekranu albo tylko z
          klawiatury. Celujemy w poziom AA wytycznych WCAG 2.2.
        </p>

        <div>
          <section>
            <h2 className="govuk-heading-m">Jak budujemy stronę</h2>
            <ul className="govuk-list govuk-list--bullet">
              <li>Duży tekst (co najmniej 18 px) i mocny kontrast.</li>
              <li>
                Przyciski i pola do wpisywania duże na tyle, żeby trafić w nie
                palcem (40 px wysokości).
              </li>
              <li>
                Projektujemy od ekranu telefonu o szerokości 360 px i z myślą o
                powiększeniu tekstu do 200%.
              </li>
              <li>
                Każdy element ma być dostępny z klawiatury, z dobrze widocznym
                zaznaczeniem.
              </li>
              <li>
                Rodzaj odpadów poznasz po nazwie, nie tylko po kolorze. W PDF do
                druku każdy rodzaj ma też swój kształt.
              </li>
              <li>
                Wyszukiwarka adresów działa też bez JavaScriptu: wpisz ulicę
                albo wieś i wybierz „Szukaj”.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="govuk-heading-m">Jak to sprawdzamy</h2>
            <p className="govuk-body">
              Przy każdej zmianie strony automatycznie uruchamiamy dwa testy:
              walidator HTML (Nu Html Checker, ten sam co na validator.w3.org)
              oraz axe-core, który szuka błędów dostępności według WCAG 2.2 AA.
              Sprawdzamy każdą stronę na ekranie telefonu i komputera. Ostatnio:{" "}
              <time dateTime="2026-10-20">20 października 2026</time>, bez
              błędów.
            </p>
          </section>

          <section>
            <h2 className="govuk-heading-m">Czego jeszcze nie wiemy</h2>
            <ul className="govuk-list govuk-list--bullet">
              <li>
                Automatyczne testy wyłapują tylko część problemów. Nie
                sprawdziliśmy jeszcze ręcznie strony z czytnikiem ekranu, samą
                klawiaturą ani przy powiększeniu 200% na prawdziwych
                urządzeniach.
              </li>
              <li>
                PDF do druku ma oznaczoną strukturę, ale nie przeszedł jeszcze
                osobnego testu dostępności PDF.
              </li>
              <li>
                Oryginalne harmonogramy gminy to często obrazki. Przepisujemy je
                na tekst, ale samych plików źródłowych nie poprawimy.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="govuk-heading-m">Coś nie działa?</h2>
            <p className="govuk-body">
              Napisz, co było trudne i na jakim urządzeniu. Każda taka wiadomość
              pomaga.
            </p>
            <p className="govuk-body">
              <a href="mailto:kontakt@conaulicy.pl" className="govuk-link">
                kontakt@conaulicy.pl
              </a>
            </p>
          </section>

          <section>
            <h2 className="govuk-heading-m">Z czego zbudowana jest strona</h2>
            <p className="govuk-body">
              Korzystamy z darmowych, otwartych projektów. Dziękujemy ich
              autorom.
            </p>
            <ul className="govuk-list govuk-list--bullet">
              <li>
                Wygląd strony, przyciski i formularze: GOV.UK Frontend (
                <a
                  href="https://github.com/alphagov/govuk-frontend/blob/main/LICENSE.txt"
                  className="govuk-link"
                >
                  licencja MIT
                </a>
                , ©&nbsp;Crown copyright).
              </li>
              <li>
                Krój pisma: Atkinson Hyperlegible Next (
                <a href="/fonts/OFL.txt" className="govuk-link">
                  licencja SIL OFL
                </a>
                ).
              </li>
            </ul>
          </section>

          <p className="govuk-body">
            Ostatnia zmiana tej strony:{" "}
            <time dateTime="2026-10-20">20 października 2026</time>.
          </p>
        </div>
      </div>
    </div>
  );
}
