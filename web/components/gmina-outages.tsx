import type { Metadata } from "next";
import Link from "next/link";
import { OutageDetails } from "@/components/outage-page";
import { PageDay } from "@/components/page-day";
import { PageHead } from "@/components/page-head";
import { gminaPowerPage, gminaWaterPage } from "@/lib/gmina-outages";
import { gminaPowerDef, gminaWaterDef } from "@/lib/gmina-pages";
import { MODULES } from "@/lib/modules";
import { type OutagePage, outageDescription } from "@/lib/outage-view";
import { pageData } from "@/lib/page-cache";
import { PGE_GENITIVE } from "@/lib/power-module";
import { pageMetadata } from "@/lib/share";
import { SITE_AREA } from "@/lib/share-card";
import { GMINA_OUTAGE_PATH, type GminaOutageSlug } from "@/lib/static-pages";
import { sourcesWhose } from "@/lib/water-module";
import { WATER_SOURCES } from "@/lib/water-sources";

// The gmina-wide outage pages, /woda and /prad (lib/gmina-outages.ts):
// the site's one page frame (docs/layout.md), as /ulice: the band with
// the module's h1 and tile (as its address subpage's), a lead, and the way
// to one's own address (the search, on the home page only); then the
// outages' one body (components/outage-page.tsx OutageDetails), in the
// module's colours, as on the address subpages. Prerendered whole, its
// data one cache scope (lib/gmina-pages.ts), for its Warsaw day (PageDay).

/** Whose dates each page gives, in the genitive (outageDescription). */
const WHOSE: Record<GminaOutageSlug, string> = {
  woda: sourcesWhose(WATER_SOURCES),
  prad: PGE_GENITIVE,
};

/** The lead under each h1: what the page covers. */
const LEAD: Record<GminaOutageSlug, string> = {
  woda: `Wszystkie zapowiedziane przerwy w Lubaczowie i we wsiach gminy, według ${sourcesWhose(WATER_SOURCES)}.`,
  prad: `Wszystkie planowane przerwy i awarie w Lubaczowie i we wsiach gminy, według ${PGE_GENITIVE}.`,
};

/**
 * A gmina-wide page's metadata: its own canonical, the title
 * "<h1> – <area>" (the area in the title only, as the home page's), the
 * subpages' description pattern for the whole gmina.
 */
export function gminaMetadata(slug: GminaOutageSlug): Metadata {
  const { pageTitle } = MODULES[slug];
  return pageMetadata({
    path: GMINA_OUTAGE_PATH[slug],
    title: `${pageTitle} – ${SITE_AREA}`,
    description: outageDescription(
      pageTitle,
      { label: SITE_AREA },
      WHOSE[slug],
    ),
  });
}

/** The page's day and body, from its one cache scope. */
async function bodyOf(slug: GminaOutageSlug) {
  if (slug === "woda") {
    const { view } = await pageData(gminaWaterDef);
    return { today: view.today, page: gminaWaterPage(view.data, view.built) };
  }
  const { view } = await pageData(gminaPowerDef);
  return { today: view.today, page: gminaPowerPage(view.data, view.built) };
}

/** The page, from its cache scope (GminaPage). */
export async function GminaOutages({ slug }: { slug: GminaOutageSlug }) {
  const { today, page } = await bodyOf(slug);
  return <GminaPage slug={slug} today={today} page={page} />;
}

/** A gmina-wide outage page, whole, for its Warsaw day `today`. */
export function GminaPage({
  slug,
  today,
  page,
}: {
  slug: GminaOutageSlug;
  today: string;
  page: OutagePage;
}) {
  return (
    <PageDay day={today}>
      <div className="govuk-width-container">
        <div className="govuk-grid-row">
          <div className="govuk-grid-column-two-thirds">
            <PageHead
              title={MODULES[slug].pageTitle}
              icon={slug}
              lead={LEAD[slug]}
            >
              <p className="govuk-body">
                Chcesz sprawdzić tylko swój adres?{" "}
                <Link href="/" className="govuk-link">
                  Wyszukaj go na stronie głównej
                </Link>
                .
              </p>
            </PageHead>
            {/* The module's colours for its badges, chips and cards
              (site.scss .app-mod--*), as on its address subpage. */}
            <div className={`app-mod app-mod--${slug}`}>
              <OutageDetails page={page} />
            </div>
          </div>
        </div>
      </div>
    </PageDay>
  );
}
