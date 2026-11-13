import type { Metadata } from "next";
import Link from "next/link";
import {
  AddressSearch,
  SearchErrorProvider,
  SearchErrorSummary,
} from "@/components/address-search";
import { Icon } from "@/components/icon";
import { ImgwSource } from "@/components/imgw-source";
import { type NowData, NowPanel, nowData } from "@/components/now-panel";
import { SkipTarget } from "@/components/skip-target";
import { SITE_URL } from "@/lib/config.generated";
import { servedVersion } from "@/lib/dataset";
import { todayInWarsaw } from "@/lib/dates";
import { HOME_EXAMPLES } from "@/lib/examples";
import { LIVE_ATTR, type LiveMarks, marksAttr } from "@/lib/live-refresh";
import { liveRuns } from "@/lib/live-runs";
import { LANG } from "@/lib/locale";
import { pageData, SOURCE_TAGS } from "@/lib/page-cache";
import { examplePlaces } from "@/lib/schedule";
import { placeHref, SEARCH_INDEX_PATH, type SearchHit } from "@/lib/search";
import { HOME_TITLE, pageMetadata, SITE_NAME } from "@/lib/share";
import { ALL_PLACES } from "@/lib/static-pages";

export const metadata: Metadata = pageMetadata({
  path: "/",
  title: { absolute: HOME_TITLE },
  description:
    "Wywóz śmieci, zapowiedziane przerwy w dostawie wody i prądu, ostrzeżenia IMGW. Wpisz ulicę w Lubaczowie albo wieś w gminie i sprawdź terminy.",
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

/**
 * Everything the home page reads, cached with it (lib/page-cache.ts)
 * under every source's tag: the panel's tiles, the examples, and the marks
 * the zuk cron compares with what is stored (lib/live-refresh.ts): the
 * day, the dataset version and each live source's run id as read.
 */
function homeData() {
  return pageData("/", Object.values(SOURCE_TAGS), async () => {
    const now = Date.now();
    const [panel, examples, dataset, runs] = await Promise.all([
      nowData(now),
      // A few examples only: the full address list never ships to the client.
      examplePlaces(HOME_EXAMPLES),
      servedVersion(),
      liveRuns(),
    ]);
    const marks: LiveMarks = {
      day: todayInWarsaw(new Date(now)),
      dataset,
      runs,
    };
    return { panel, examples, marks };
  });
}

/** The sample addresses. */
function HomeExamples({ places }: { places: SearchHit[] }) {
  return (
    <section aria-labelledby="sample-heading">
      <h2 id="sample-heading" className="govuk-heading-m">
        Przykładowe adresy
      </h2>
      <ul className="app-chips app-chips--links govuk-!-margin-bottom-6">
        {places.map((place) => (
          <li key={place.id} className="app-chip">
            <Icon name="pin" />
            <Link href={placeHref(place)} className="govuk-link">
              {place.label}
            </Link>
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
// it on a phone) „Teraz w gminie” (components/now-panel.tsx). Then the
// sample addresses and IMGW's required wording. Prerendered whole,
// re-rendered when a source it reads changes (homeData).
export default async function Home() {
  const { panel, examples, marks } = await homeData();
  return (
    <SearchErrorProvider>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: our own constant JSON, rendered on the server; React would escape it as text
        dangerouslySetInnerHTML={{ __html: WEBSITE }}
      />
      <HomeHero panel={panel} />
      <div
        className="govuk-width-container"
        {...{ [LIVE_ATTR]: marksAttr(marks) }}
      >
        <HomeExamples places={examples} />
        {/* IMGW-PIB's terms (§5), once, at the end of the page, above the
          footer: the panel shows its warnings. Small print, as the address
          page's source note. */}
        <p className="govuk-body-s app-quiet">
          <ImgwSource />
        </p>
      </div>
    </SearchErrorProvider>
  );
}

/** The hero: its own width container inside the full-width band. */
function HomeHero({ panel }: { panel: NowData }) {
  return (
    <div className="app-hero">
      <div className="govuk-width-container app-hero__grid">
        <div>
          <SkipTarget
            as="h1"
            className="govuk-heading-xl govuk-!-font-size-80 app-hero__title"
          >
            Co na Twojej <span className="app-hero__accent">ulicy?</span>
          </SkipTarget>
          <p className="govuk-body-l">
            Śmieci, woda, prąd i ostrzeżenia pogodowe dla Lubaczowa i gminy –
            pod Twoim adresem.
          </p>
          <div className="app-hero__search">
            <SearchErrorSummary />
            <AddressSearch indexUrl={SEARCH_INDEX_PATH} />
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
        <NowPanel data={panel} />
      </div>
    </div>
  );
}
