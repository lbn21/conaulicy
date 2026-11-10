import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { CheckedLine } from "@/components/checked-line";
import { NOT_FOUND_METADATA } from "@/components/page-not-found";
import { Parts } from "@/components/parts";
import { fromTo } from "@/components/rows/when";
import { SourceInset } from "@/components/subpage-parts";
import { warsawDay } from "@/lib/date-labels";
import { withHouseNumber } from "@/lib/house";
import { type Checked, span } from "@/lib/hub";
import { CURRENT, IMGW_PAGE } from "@/lib/imgw-shown";
import { IMGW_ATTRIBUTION } from "@/lib/imgw-warnings";
import { indexable } from "@/lib/indexing";
import { placePath, titleLabel } from "@/lib/places";
import { getPlace, PLACE_TAGS } from "@/lib/schedule";
import { shownNr } from "@/lib/schedule-notes";
import { pageMetadata } from "@/lib/share";
import {
  IMGW_MORE,
  levelText,
  NO_WARNINGS,
  TAG,
  type Weather,
} from "@/lib/weather-module";

// The weather module's subpage, /adres/<id>/pogoda (task 263): IMGW's
// warnings for the powiat, highest first, each with its level, when (absolute),
// IMGW's own description and probability; then IMGW's page, its required
// wording and the source. The same for every address of the powiat, so
// never a search result.

const H1 = "Ostrzeżenia pogodowe IMGW";

export async function weatherMetadata(
  id: string,
  nr: string | null,
): Promise<Metadata> {
  "use cache";
  cacheLife("max");
  cacheTag(...PLACE_TAGS);
  const place = await getPlace(id, nr);
  if (!place) return NOT_FOUND_METADATA;
  return {
    ...pageMetadata({
      path: `${placePath(id)}/pogoda`,
      title: `${H1} – ${withHouseNumber(titleLabel(place.label), shownNr(place))}`,
      description: `Ostrzeżenia meteorologiczne IMGW dla powiatu lubaczowskiego: ${place.label}.`,
    }),
    robots: { index: false, follow: indexable() },
  };
}

export function WeatherDetails({
  data,
  checkedAt = null,
}: {
  data: Weather;
  checkedAt?: Checked;
}) {
  const notice = data.shown?.notice;
  const warnings = data.shown?.warnings ?? [];
  return (
    <>
      <CheckedLine at={checkedAt} module="pogoda" />
      {notice && (
        <div className="govuk-inset-text">
          <Parts
            parts={[
              `${notice} ${CURRENT.text} `,
              { href: IMGW_PAGE, text: CURRENT.link },
              ".",
            ]}
            lead={false}
          />
        </div>
      )}
      {warnings.length === 0 && !notice && (
        <p className="govuk-body">{NO_WARNINGS}</p>
      )}
      {warnings.map((warning) => (
        <div key={warning.id} className="govuk-summary-card">
          <div className="govuk-summary-card__title-wrapper">
            <h2 className="govuk-summary-card__title">{warning.event}</h2>
          </div>
          <div className="govuk-summary-card__content">
            <dl className="govuk-summary-list">
              <div className="govuk-summary-list__row">
                <dt className="govuk-summary-list__key">Stopień</dt>
                <dd className="govuk-summary-list__value">
                  <strong className={TAG[warning.level]}>
                    {levelText(warning)}
                  </strong>
                </dd>
              </div>
              <div className="govuk-summary-list__row">
                <dt className="govuk-summary-list__key">Kiedy</dt>
                <dd className="govuk-summary-list__value">
                  {fromTo(
                    span(
                      warsawDay(Date.parse(warning.from)),
                      warning.from,
                      warning.to,
                    ),
                    true,
                  )}
                </dd>
              </div>
              <div className="govuk-summary-list__row">
                <dt className="govuk-summary-list__key">Gdzie</dt>
                <dd className="govuk-summary-list__value">
                  Cały powiat lubaczowski
                </dd>
              </div>
              <div className="govuk-summary-list__row">
                <dt className="govuk-summary-list__key">Opis IMGW</dt>
                <dd className="govuk-summary-list__value">
                  {warning.text} Prawdopodobieństwo: {warning.probability}%.
                </dd>
              </div>
            </dl>
          </div>
        </div>
      ))}
      {warnings.length > 0 && (
        <p className="govuk-body">
          <a href={IMGW_PAGE} className="govuk-link">
            {IMGW_MORE}
          </a>
        </p>
      )}
      <SourceInset>
        <p className="govuk-body">
          Źródło:{" "}
          <a href={IMGW_PAGE} className="govuk-link">
            IMGW-PIB
          </a>
        </p>
        <p className="govuk-body">{IMGW_ATTRIBUTION.join(" ")}</p>
      </SourceInset>
    </>
  );
}
