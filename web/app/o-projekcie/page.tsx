import type { Metadata } from "next";
import { ImgwBanner } from "@/components/imgw-banner";
import { pageMetadata } from "@/lib/share";
import { ABOUT, ACCESSIBILITY, PRIVACY } from "@/lib/static-pages";

export const metadata: Metadata = pageMetadata({
  path: ABOUT.path,
  title: ABOUT.text,
  description:
    "Darmowa, niekomercyjna strona dla mieszkańców Lubaczowa i okolicznych wsi. Skąd bierzemy terminy wywozu śmieci i dlaczego rację ma zawsze harmonogram gminy.",
});

export default function AboutPage() {
  return (
    <>
      <ImgwBanner />
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <h1 className="govuk-heading-l">{ABOUT.text}</h1>
          <p className="govuk-body-l">
            conaulicy.pl to prosta strona dla Lubaczowa i okolicznych wsi:
            wpisujesz ulicę albo wieś i od razu widzisz, kiedy przyjedzie
            śmieciarka.
          </p>
          <p className="govuk-body">
            Gdy IMGW ogłosi ostrzeżenie pogodowe dla powiatu lubaczowskiego,
            pokażemy je na górze każdej strony.
          </p>
          <p className="govuk-body">
            Strona jest darmowa i niekomercyjna. Nie ma na niej reklam ani kont.
          </p>
          <p className="govuk-body">
            Zrobił ją Jakub Marciniszyn dla mieszkańców Lubaczowa.
          </p>
          <p className="govuk-body">
            Terminy przepisujemy z harmonogramów miasta Lubaczów i gminy
            Lubaczów. Przy każdym adresie podajemy źródło i datę, kiedy je
            sprawdziliśmy.
          </p>
          <p className="govuk-body">
            Nie jesteśmy urzędem. Gdyby coś się nie zgadzało, rację ma
            harmonogram gminy.
          </p>
          <p className="govuk-body">
            Jak dbamy o Twoją prywatność, opisujemy w zakładce{" "}
            <a href={PRIVACY.path} className="govuk-link">
              {PRIVACY.text}
            </a>
            , a o wygodę korzystania – w zakładce{" "}
            <a href={ACCESSIBILITY.path} className="govuk-link">
              {ACCESSIBILITY.text}
            </a>
            .
          </p>
        </div>
      </div>
    </>
  );
}
