import type { Metadata } from "next";
import { ContactLink } from "@/components/contact-link";
import { ImgwBanner } from "@/components/imgw-banner";
import { PageMain } from "@/components/page-main";
import { pageMetadata } from "@/lib/share";
import { ABOUT, ACCESSIBILITY, PRIVACY } from "@/lib/static-pages";
import { GMINA_NEWS, MZGKIM_NEWS } from "@/lib/water-module";

export const metadata: Metadata = pageMetadata({
  path: ABOUT.path,
  title: ABOUT.text,
  description:
    "Darmowa strona dla Lubaczowa i gminy: wywóz śmieci, przerwy w dostawie wody i ostrzeżenia IMGW. Skąd bierzemy dane i jak je sprawdzamy.",
});

// The address register the house-number note checks against (lib/prg.ts).
const PRG_PAGE =
  "https://www.geoportal.gov.pl/pl/dane/panstwowy-rejestr-granic-prg/";

export default function AboutPage() {
  return (
    <PageMain>
      <ImgwBanner />
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <h1 className="govuk-heading-l">{ABOUT.text}</h1>
          <p className="govuk-body-l">
            conaulicy.pl to prosta strona dla Lubaczowa i okolicznych wsi:
            wpisujesz ulicę albo wieś i od razu widzisz, kiedy przyjedzie
            śmieciarka, czy gmina zapowiedziała przerwę w dostawie wody i czy
            IMGW ostrzega przed złą pogodą.
          </p>
          <p className="govuk-body">
            Przerwy w dostawie wody bierzemy z komunikatów, które gmina ogłasza
            w swoich{" "}
            <a href={GMINA_NEWS} className="govuk-link">
              aktualnościach na gminalubaczow.pl
            </a>
            , a w Lubaczowie także z{" "}
            <a href={MZGKIM_NEWS} className="govuk-link">
              komunikatów MZGKiM
            </a>
            .
          </p>
          <p className="govuk-body">
            Gdy IMGW ogłosi ostrzeżenie pogodowe dla powiatu lubaczowskiego,
            pokażemy je na górze strony. Gdy ostrzeżeń nie ma, przy adresie
            przeczytasz o tym w części „Nic nie zapowiedziano”.
          </p>
          <p className="govuk-body">
            Strona jest darmowa i niekomercyjna. Nie ma na niej reklam ani kont.
          </p>
          <p className="govuk-body">
            Zrobił ją Jakub Marciniszyn dla mieszkańców Lubaczowa i gminy.
          </p>
          <p className="govuk-body">
            Terminy wywozu i przerwy w dostawie wody odczytujemy automatycznie,
            z pomocą sztucznej inteligencji, z harmonogramów i komunikatów
            miasta Lubaczów i gminy Lubaczów. Potem je sprawdzamy, a dopóki tego
            nie zrobimy, piszemy o tym przy adresie. Przy każdym adresie
            podajemy źródło i datę, kiedy je sprawdziliśmy.
          </p>
          <p className="govuk-body">
            Wpisany numer domu porównujemy z{" "}
            <a href={PRG_PAGE} className="govuk-link">
              państwowym rejestrem adresów (PRG, GUGiK)
            </a>
            .
          </p>
          <p className="govuk-body">
            Nie jesteśmy urzędem. Gdyby coś się nie zgadzało, rację mają
            harmonogram i komunikaty gminy.
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
          <p className="govuk-body">
            Masz uwagę albo widzisz błąd? Napisz: <ContactLink />
          </p>
        </div>
      </div>
    </PageMain>
  );
}
