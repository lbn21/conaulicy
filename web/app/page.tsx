import type { Metadata } from "next";
import { AddressSearch } from "@/components/address-search";
import { ImgwBanner } from "@/components/imgw-banner";
import { SITE_URL } from "@/lib/config.generated";
import { HOME_EXAMPLES } from "@/lib/examples";
import { LANG } from "@/lib/locale";
import { examplePlaces, searchIndexUrl } from "@/lib/schedule";
import { placeHref } from "@/lib/search";
import { HOME_H1, HOME_TITLE, pageMetadata, SITE_NAME } from "@/lib/share";
import { ALL_PLACES } from "@/lib/static-pages";

export const metadata: Metadata = pageMetadata({
  path: "/",
  title: { absolute: HOME_TITLE },
  description:
    "Wywóz śmieci, zapowiedziane przez gminę przerwy w dostawie wody i ostrzeżenia IMGW. Wpisz ulicę w Lubaczowie albo wieś w gminie i sprawdź terminy.",
});

// For search engines: the site's name. No SearchAction: the results page
// (/szukaj, for the form without JS) is never indexed.
const WEBSITE = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: `${SITE_URL}/`,
  inLanguage: LANG,
});

export default async function Home() {
  // A few examples only: the full address list never ships to the client.
  const [places, indexUrl] = await Promise.all([
    examplePlaces(HOME_EXAMPLES),
    searchIndexUrl(),
  ]);

  // A lookup page, as GOV.UK's "Find your local council": the task in the
  // heading, one line on what you will see, the field, then what you get.
  return (
    <>
      <ImgwBanner />
      <div className="govuk-grid-row">
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: our own constant JSON, rendered on the server; React would escape it as text
          dangerouslySetInnerHTML={{ __html: WEBSITE }}
        />
        <div className="govuk-grid-column-two-thirds">
          <h1 className="govuk-heading-xl">{HOME_H1}</h1>
          <p className="govuk-body-l">
            Zobaczysz, kiedy przyjedzie śmieciarka, czy gmina zapowiedziała
            przerwę w dostawie wody i czy IMGW ostrzega przed złą pogodą.
          </p>

          <div className="govuk-!-margin-bottom-8">
            <AddressSearch indexUrl={indexUrl} />
          </div>

          <h2 className="govuk-heading-m">Co zobaczysz</h2>
          <ul className="govuk-list govuk-list--bullet govuk-!-margin-bottom-8">
            <li>
              kiedy przyjedzie śmieciarka – osobno dla każdego rodzaju odpadów
            </li>
            <li>przerwy w dostawie wody zapowiedziane przez gminę</li>
            <li>ostrzeżenia pogodowe IMGW dla powiatu lubaczowskiego</li>
            <li>
              terminy wywozu do kalendarza w telefonie jednym kliknięciem i
              harmonogram do wydruku (PDF)
            </li>
          </ul>

          <section aria-labelledby="sample-heading">
            <h2 id="sample-heading" className="govuk-heading-m">
              Przykładowe adresy
            </h2>
            <ul className="govuk-list">
              {places.map((place) => (
                <li key={place.id}>
                  <a href={placeHref(place)} className="govuk-link">
                    {place.label}
                  </a>
                </li>
              ))}
            </ul>
            <p className="govuk-body">
              <a href={ALL_PLACES.path} className="govuk-link">
                Zobacz wszystkie ulice i wsie
              </a>
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
