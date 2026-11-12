import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import {
  AddressSearch,
  SearchErrorProvider,
  SearchErrorSummary,
} from "@/components/address-search";
import { Icon } from "@/components/icon";
import { NowPanel } from "@/components/now-panel";
import { PlaceLink } from "@/components/place-link";
import { SITE_URL } from "@/lib/config.generated";
import { HOME_EXAMPLES } from "@/lib/examples";
import { DATASET } from "@/lib/headers";
import { IMGW_PAGE } from "@/lib/imgw-shown";
import { IMGW_ATTRIBUTION, IMGW_NAME } from "@/lib/imgw-warnings";
import { LANG } from "@/lib/locale";
import { examplePlaces, searchIndexUrl } from "@/lib/schedule";
import { placeHref } from "@/lib/search";
import { HOME_TITLE, pageMetadata, SITE_NAME } from "@/lib/share";
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

// The hero's three reassurances, each with the accent's check icon.
const TRUST = [
  "Za darmo, bez logowania",
  "Bez reklam",
  "Dane z gminy, IMGW i PGE",
];

/** The search field, static: its index URL changes with an import. */
async function HomeSearch() {
  "use cache";
  cacheLife("max");
  cacheTag(DATASET);
  return <AddressSearch indexUrl={await searchIndexUrl()} />;
}

/** The sample addresses, static: cached until the next import or deploy. */
async function HomeExamples() {
  "use cache";
  cacheLife("max");
  cacheTag(DATASET);
  // A few examples only: the full address list never ships to the client.
  const places = await examplePlaces(HOME_EXAMPLES);
  return (
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
  );
}

// The home page (t390, mockup D): a full-width hero in the brand's
// gradient (HomeHero, site.scss .app-hero), the task in the heading, one
// line, the search on a white card, three reassurances; beside it (under
// it on a phone) „Teraz w gminie”, read per request behind its skeleton
// (components/now-panel.tsx). Then the sample addresses and IMGW's
// required wording. Everything but
// the panel is static, cached until the next import or deploy.
export default function Home() {
  return (
    <SearchErrorProvider>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: our own constant JSON, rendered on the server; React would escape it as text
        dangerouslySetInnerHTML={{ __html: WEBSITE }}
      />
      <HomeHero />
      <div className="govuk-width-container">
        <HomeExamples />
        {/* IMGW-PIB's terms (§5), once, at the end of the page, above the
          footer: the panel shows its warnings. Small print, as the address
          page's source note. */}
        <p className="govuk-body-s app-quiet">
          {IMGW_ATTRIBUTION.source[0]}
          <a className="govuk-link" href={IMGW_PAGE}>
            {IMGW_NAME}
          </a>
          {`${IMGW_ATTRIBUTION.source[1]} ${IMGW_ATTRIBUTION.processed}`}
        </p>
      </div>
    </SearchErrorProvider>
  );
}

/** The hero: its own width container inside the full-width band. */
function HomeHero() {
  return (
    <div className="app-hero">
      <div className="govuk-width-container app-hero__grid">
        <div>
          <h1 className="govuk-heading-xl govuk-!-font-size-80 app-hero__title">
            Co na Twojej <span className="app-hero__accent">ulicy?</span>
          </h1>
          <p className="govuk-body-l">
            Śmieci, woda, prąd i ostrzeżenia pogodowe dla Lubaczowa i gminy –
            pod Twoim adresem.
          </p>
          <div className="app-hero__search">
            <SearchErrorSummary />
            <HomeSearch />
          </div>
          <ul className="govuk-body-s app-hero__trust">
            {TRUST.map((text) => (
              <li key={text}>
                <Icon name="check" />
                {text}
              </li>
            ))}
          </ul>
        </div>
        <NowPanel />
      </div>
    </div>
  );
}
