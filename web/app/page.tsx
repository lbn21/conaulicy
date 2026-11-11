import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import {
  AddressSearch,
  SearchErrorProvider,
  SearchErrorSummary,
} from "@/components/address-search";
import { Icon, type IconName, Tile } from "@/components/icon";
import { PlaceLink } from "@/components/place-link";
import { SITE_URL } from "@/lib/config.generated";
import { HOME_EXAMPLES } from "@/lib/examples";
import { DATASET } from "@/lib/headers";
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

// For search engines: the site's name. No SearchAction: the search has no
// results page (it lists results under its field). `<` escaped, as Next.js's
// JSON-LD guide does, so no value can close the <script>.
const WEBSITE = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: `${SITE_URL}/`,
  inLanguage: LANG,
}).replace(/</g, "\\u003c");

// „Co zobaczysz”: a line per module, with its icon on its colour's tile
// (site.scss .app-items, .app-mod--*), the calendar's on a neutral one.
const FEATURES: [IconName, string][] = [
  ["smieci", "dni wywozu śmieci – dla każdego rodzaju odpadów osobno"],
  ["woda", "zapowiedziane przez gminę przerwy w dostawie wody"],
  ["prad", "planowane przerwy i awarie w dostawie prądu (PGE)"],
  ["pogoda", "ostrzeżenia IMGW przed złą pogodą w powiecie lubaczowskim"],
  [
    "calendar",
    "terminy wywozu w kalendarzu w telefonie i harmonogram do wydruku (PDF)",
  ],
];

// The page, static: cached until the next import or deploy (cacheLife
// "max"), tagged with what it reads: the dataset (examples, index), which
// the import purges.
export default async function Home() {
  "use cache";
  cacheLife("max");
  cacheTag(DATASET);
  // A few examples only: the full address list never ships to the client.
  const [places, indexUrl] = await Promise.all([
    examplePlaces(HOME_EXAMPLES),
    searchIndexUrl(),
  ]);

  // A lookup page, as GOV.UK's "Find your local council": the task in the
  // heading, one line of what to do, the field, then what you get.
  return (
    <SearchErrorProvider>
      <div className="govuk-grid-row">
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: our own constant JSON, rendered on the server; React would escape it as text
          dangerouslySetInnerHTML={{ __html: WEBSITE }}
        />
        <div className="govuk-grid-column-two-thirds">
          <SearchErrorSummary />
          <h1 className="govuk-heading-xl">{HOME_H1}</h1>
          <p className="govuk-body-l">
            Wpisz ulicę albo wieś i sprawdź terminy.
          </p>

          <div className="app-panel govuk-!-margin-bottom-8">
            <AddressSearch indexUrl={indexUrl} />
          </div>

          <h2 className="govuk-heading-m">Co zobaczysz</h2>
          <ul className="app-items app-items--plain govuk-!-margin-bottom-8">
            {FEATURES.map(([icon, text]) => (
              <li key={icon} className={`app-item app-mod app-mod--${icon}`}>
                <Tile name={icon} />
                <span className="app-item__body">{text}</span>
              </li>
            ))}
          </ul>

          <section aria-labelledby="sample-heading">
            <h2 id="sample-heading" className="govuk-heading-m">
              Przykładowe adresy
            </h2>
            <ul className="app-chips app-chips--links govuk-!-margin-bottom-6">
              {places.map((place) => (
                <li key={place.id} className="app-chip">
                  <Icon name="pin" />
                  <PlaceLink href={placeHref(place)} className="govuk-link">
                    {place.label}
                  </PlaceLink>
                </li>
              ))}
            </ul>
            <p className="govuk-body">
              <Link href={ALL_PLACES.path} className="govuk-link">
                Zobacz wszystkie ulice i wsie
              </Link>
            </p>
          </section>
        </div>
      </div>
    </SearchErrorProvider>
  );
}
