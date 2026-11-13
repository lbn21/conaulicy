import type { Metadata } from "next";
import Link from "next/link";
import { ContactLink } from "@/components/contact-link";
import { PageHead } from "@/components/page-head";
import { PGE_GENITIVE, PGE_PAGE } from "@/lib/power-module";
import { notAnOffice } from "@/lib/schedule-notes";
import { pageMetadata } from "@/lib/share";
import { ABOUT, ACCESSIBILITY, AUTHOR_LINE, PRIVACY } from "@/lib/static-pages";
import { SITE_TOPICS } from "@/lib/topics";
import { GMINA_NEWS, MZGKIM_NEWS } from "@/lib/water-module";

export const metadata: Metadata = pageMetadata({
  path: ABOUT.path,
  title: ABOUT.text,
  description: `Darmowa strona dla Lubaczowa i gminy: ${SITE_TOPICS}. Skąd bierzemy dane i jak je sprawdzamy.`,
});

// GUS's register of place and street names (TERYT), the import's source
// (docs/data/sources.md).
const TERYT_PAGE = "https://eteryt.stat.gov.pl/";

// Both offices whose schedules and notices the site reads.
const OFFICES = notAnOffice(
  "harmonogramy i komunikaty Urzędu Gminy Lubaczów i Urzędu Miejskiego w Lubaczowie",
  "obowiązują",
);

export default function AboutPage() {
  return (
    <div className="govuk-width-container">
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <PageHead
            title={ABOUT.text}
            lead="conaulicy.pl to prosta strona dla Lubaczowa i okolicznych wsi: wpisujesz ulicę albo wieś i od razu widzisz, kiedy przyjedzie śmieciarka, czy zapowiedziano przerwę w dostawie wody lub prądu i czy IMGW ostrzega przed złą pogodą."
          />
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
            Przerwy w dostawie prądu, zarówno planowane, jak i awaryjne,
            bierzemy od{" "}
            <a href={PGE_PAGE} className="govuk-link">
              {PGE_GENITIVE}
            </a>
            . Pokazujemy je tak, jak podaje je PGE, razem z numerami domów.
          </p>
          <p className="govuk-body">
            Ostrzeżenia pogodowe IMGW dla powiatu lubaczowskiego pokazujemy na
            stronie adresu, nad listą najbliższych dni, każde z opisem, czego
            się spodziewać. Gdy ostrzeżeń nie ma, nic tam nie wyświetlamy.
            Źródło, czas ostatniej zmiany i to, jak często sprawdzamy, podajemy
            na dole strony adresu.
          </p>
          <p className="govuk-body">
            Strona jest darmowa i niekomercyjna. Nie ma na niej reklam ani kont.
          </p>
          <p className="govuk-body">{AUTHOR_LINE}</p>
          <p className="govuk-body">
            Terminy odbioru śmieci i przerwy w dostawie wody odczytujemy
            automatycznie, z pomocą sztucznej inteligencji, z harmonogramów i
            komunikatów miasta Lubaczów i gminy Lubaczów. Dopóki ich nie
            sprawdzimy, piszemy o tym na stronie tematu. Źródło podajemy na
            stronie każdego tematu: śmieci, wody i prądu.
          </p>
          <p className="govuk-body">
            Nazwy ulic i miejscowości bierzemy z{" "}
            <a href={TERYT_PAGE} className="govuk-link">
              rejestru TERYT (GUS)
            </a>
            .
          </p>
          <p className="govuk-body">{OFFICES}</p>
          <p className="govuk-body">
            Jak dbamy o Twoją prywatność, opisujemy na stronie{" "}
            <Link href={PRIVACY.path} className="govuk-link">
              {PRIVACY.text}
            </Link>
            , a o wygodę korzystania – na stronie{" "}
            <Link href={ACCESSIBILITY.path} className="govuk-link">
              {ACCESSIBILITY.text}
            </Link>
            .
          </p>
          <p className="govuk-body">
            Masz uwagę albo widzisz błąd? Napisz: <ContactLink />
          </p>
        </div>
      </div>
    </div>
  );
}
