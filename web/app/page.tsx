import type { Metadata } from "next";
import { AddressSearch } from "@/components/address-search";
import { SITE_URL } from "@/lib/config.generated";
import { HOME_EXAMPLES } from "@/lib/examples";
import { examplePlaces, searchIndexUrl } from "@/lib/schedule";
import { placeHref } from "@/lib/search";
import { HOME_TITLE, pageMetadata, SITE_NAME } from "@/lib/share";

export const metadata: Metadata = pageMetadata({
  path: "/",
  title: { absolute: HOME_TITLE },
  description:
    "Kiedy śmieciarka przyjedzie na Twoją ulicę w Lubaczowie i gminie? Terminy do kalendarza w telefonie i do wydruku.",
});

// For search engines: the site's name. No SearchAction: the results page
// (/szukaj, for the form without JS) is never indexed.
const WEBSITE = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: `${SITE_URL}/`,
  inLanguage: "pl",
});

export default async function Home() {
  // A few examples only: the full address list never ships to the client.
  const [places, indexUrl] = await Promise.all([
    examplePlaces(HOME_EXAMPLES),
    searchIndexUrl(),
  ]);

  // A lookup page, as GOV.UK's "Find your local council": the service in the
  // heading, one line of context, the field, then what you get.
  return (
    <div className="govuk-grid-row">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: our own constant JSON, rendered on the server; React would escape it as text
        dangerouslySetInnerHTML={{ __html: WEBSITE }}
      />
      <div className="govuk-grid-column-two-thirds">
        <h1 className="govuk-heading-xl">Sprawdź dzień wywozu śmieci</h1>
        <p className="govuk-body-l">Dla Lubaczowa i wsi w gminie Lubaczów.</p>

        <div className="govuk-!-margin-bottom-8">
          <AddressSearch indexUrl={indexUrl} />
        </div>

        <h2 className="govuk-heading-m">Co zobaczysz</h2>
        <ul className="govuk-list govuk-list--bullet govuk-!-margin-bottom-8">
          <li>kiedy przyjedzie śmieciarka i co wystawić przed dom</li>
          <li>wszystkie terminy do dodania do kalendarza w telefonie</li>
          <li>harmonogram do wydrukowania (PDF)</li>
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
            <a href="/ulice" className="govuk-link">
              Zobacz wszystkie ulice i wsie
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
