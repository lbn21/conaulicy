import { Fragment } from "react";
import { type Banner, banner, CURRENT, IMGW_PAGE } from "@/lib/imgw-banner";
import { imgwCopy } from "@/lib/live-store";

type Shown = Banner["warnings"][number];

// What shows above the fold: the event, its level and until (or from) when.
function Line({ warning }: { warning: Shown }) {
  return (
    <>
      <strong>{warning.event}</strong>{" "}
      <strong className={warning.tag}>{warning.level}</strong> {warning.short}
    </>
  );
}

// IMGW's meteo warnings for the powiat (docs/data/imgw.md), above the h1 of
// every page but the address pages (/adres/**, whose „Najbliższe dni”
// carries them, components/hub.tsx): GOV.UK's notification banner, neutral,
// as govuk-frontend 6.5.1's template. Compact: one line per warning, the rest
// in GOV.UK's details (native <details>, closed). Server-rendered, no client
// JS (its data-module is not initialised: GOV.UK's script only focuses
// role="alert" banners). From the last good copy in the store, never IMGW
// itself (lib/live-store.ts). Nothing at all when there is no copy yet, or
// a fresh one has no warning; a notice first when the last good check is
// old, with or without warnings, or alone when the store cannot be read
// now (lib/imgw-banner.ts): the rest of the page renders as ever.
export async function ImgwBanner() {
  const shown = banner(await imgwCopy(), Date.now());
  if (!shown) return null;
  const several = shown.warnings.length > 1;
  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        {/* biome-ignore lint/a11y/useSemanticElements: GOV.UK's markup, unchanged (a div with role="region") */}
        <div
          className="govuk-notification-banner"
          role="region"
          aria-labelledby="imgw-banner-title"
          data-module="govuk-notification-banner"
        >
          <div className="govuk-notification-banner__header">
            <h2
              className="govuk-notification-banner__title"
              id="imgw-banner-title"
            >
              {shown.title}
            </h2>
          </div>
          <div className="govuk-notification-banner__content">
            {shown.notice && (
              <p className="govuk-body">
                {shown.notice} {CURRENT.text}{" "}
                <a className="govuk-notification-banner__link" href={IMGW_PAGE}>
                  {CURRENT.link}
                </a>
                .
              </p>
            )}
            {shown.warnings.length === 0 ? null : several ? (
              <ul className="govuk-list">
                {shown.warnings.map((warning) => (
                  <li key={warning.id}>
                    <Line warning={warning} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="govuk-body">
                <Line warning={shown.warnings[0]} />
              </p>
            )}
            {shown.warnings.length > 0 && (
              <>
                <p className="govuk-body-s">{shown.source}</p>
                <details className="govuk-details">
                  <summary className="govuk-details__summary">
                    <span className="govuk-details__summary-text">
                      {shown.more}
                    </span>
                  </summary>
                  <div className="govuk-details__text">
                    {shown.warnings.map((warning) => (
                      <Fragment key={warning.id}>
                        {/* Several: which warning the sentences below belong to. */}
                        {several && (
                          <h3 className="govuk-heading-s">
                            {warning.event} – {warning.level}
                          </h3>
                        )}
                        <p className="govuk-body">{warning.when}</p>
                        <p className="govuk-body">{warning.details}</p>
                      </Fragment>
                    ))}
                    <p className="govuk-body">
                      <a
                        className="govuk-notification-banner__link"
                        href={IMGW_PAGE}
                      >
                        Szczegóły i mapa na meteo.imgw.pl
                      </a>
                    </p>
                    <p className="govuk-body-s">{shown.footer}</p>
                    {/* IMGW's required wording, as secondary text (task 205). */}
                    <p className="govuk-hint govuk-!-font-size-16">
                      {shown.attribution}
                    </p>
                  </div>
                </details>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
