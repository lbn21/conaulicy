import { Status } from "@/components/parts";
import { fromTo } from "@/components/rows/when";
import { SourceInset } from "@/components/subpage-parts";
import { warsawDay } from "@/lib/date-labels";
import { span } from "@/lib/hub";
import { IMGW_ATTRIBUTION } from "@/lib/imgw-warnings";
import { LOCALE } from "@/lib/locale";
import {
  levelText,
  NO_WARNINGS,
  POWIAT,
  TAG,
  type Weather,
  weatherNotices,
  weatherSources,
} from "@/lib/weather-module";

// The weather module's subpage, /adres/<id>/pogoda (task 263): IMGW's
// warnings for the powiat, highest first, each with its level, when (absolute),
// IMGW's own description and probability; then the source (IMGW's page)
// and its required wording. The same for every address of the powiat, so
// never a search result.

/** „75%”: IMGW's probability, a percentage. */
const PERCENT = new Intl.NumberFormat(LOCALE, { style: "percent" });

/** The subpage's body, under its heading (components/module-page.tsx Subpage). */
export function WeatherDetails({ data }: { data: Weather }) {
  const notices = weatherNotices(data);
  const warnings = data.shown?.warnings ?? [];
  return (
    <>
      {notices.length > 0 && (
        <div className="govuk-inset-text">
          <Status groups={notices} />
        </div>
      )}
      {warnings.length === 0 && notices.length === 0 && (
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
                <dd className="govuk-summary-list__value">{POWIAT.name}</dd>
              </div>
              <div className="govuk-summary-list__row">
                <dt className="govuk-summary-list__key">Opis IMGW</dt>
                <dd className="govuk-summary-list__value">
                  {`${warning.text} Prawdopodobieństwo: ${PERCENT.format(warning.probability / 100)}.`}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      ))}
      <SourceInset sources={weatherSources()}>
        <p className="govuk-hint govuk-!-font-size-16">
          {IMGW_ATTRIBUTION.join(" ")}
        </p>
      </SourceInset>
    </>
  );
}
