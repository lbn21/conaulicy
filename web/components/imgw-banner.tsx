import { io } from "next/cache";
import { Fragment } from "react";
import { BlockSkeleton, LiveBlock } from "@/components/live-block";
import { Skeleton } from "@/components/skeleton";
import { clockTime } from "@/lib/date-labels";
import {
  type Banner,
  banner,
  CURRENT,
  IMGW_PAGE,
  UNREADABLE,
} from "@/lib/imgw-banner";
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
// every page but the address pages (/adres/**, whose „Najbliższe dni” and
// „Pogoda” carry them, components/hub.tsx). Always there: with no warning,
// one quiet line, its source linked and when we checked; with warnings, or
// a notice that the last good check is old, or alone when the store cannot
// be read now (lib/imgw-banner.ts), GOV.UK's notification banner, neutral,
// as govuk-frontend 6.5.1's template. Compact: one line per warning, the
// rest in GOV.UK's details (native <details>, closed). Server-rendered, no
// client JS (its data-module is not initialised: GOV.UK's script only
// focuses role="alert" banners). From the last good copy in the store,
// never IMGW itself (lib/live-store.ts). Read per request in its own hole
// (ImgwLive), never in the pages' cached shells, so the time it shows and
// the warnings come from the same read.

// The quiet line's start; the rest says when we checked.
const QUIET = "brak ostrzeżeń dla powiatu lubaczowskiego";

/** The line when there is no warning: „IMGW: brak ostrzeżeń … · sprawdziliśmy 14:52”. */
function Quiet({ checkedAt }: { checkedAt: number | null }) {
  return (
    <div className="govuk-grid-row app-imgw">
      <div className="govuk-grid-column-two-thirds">
        <p className="govuk-body-s">
          <a className="govuk-link" href={IMGW_PAGE}>
            Ostrzeżenia IMGW
          </a>
          {checkedAt === null
            ? ": jeszcze ich nie sprawdziliśmy"
            : `: ${QUIET} · sprawdziliśmy ${clockTime(checkedAt)}`}
        </p>
      </div>
    </div>
  );
}

async function ImgwBanner() {
  await io();
  const copy = await imgwCopy();
  const shown = banner(copy, Date.now());
  if (!shown)
    return (
      <Quiet checkedAt={copy && copy !== UNREADABLE ? copy.checkedAt : null} />
    );
  const several = shown.warnings.length > 1;
  return (
    <div className="govuk-grid-row app-imgw">
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

// The typical shape: the quiet line (no warning is the usual state). Its
// row, as the quiet line's and the banner's, is at least one line tall
// (app-imgw), so the skeleton and the quiet line hold the same height.
const SKELETON = (
  <div className="govuk-grid-row app-imgw">
    <div className="govuk-grid-column-two-thirds">
      <BlockSkeleton>
        <p className="govuk-body-s">
          <Skeleton>{`Ostrzeżenia IMGW: ${QUIET} · sprawdziliśmy 14:52`}</Skeleton>
        </p>
      </BlockSkeleton>
    </div>
  </div>
);

/** The banner in its own hole, with its skeleton (components/live-block.tsx). */
export function ImgwLive() {
  return (
    <LiveBlock skeleton={SKELETON}>
      <ImgwBanner />
    </LiveBlock>
  );
}
