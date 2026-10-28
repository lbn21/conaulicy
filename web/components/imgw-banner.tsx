import { unstable_cache } from "next/cache";
import { Fragment } from "react";
import { type Banner, banner, IMGW_PAGE } from "@/lib/imgw-banner";
import {
  type Feed,
  fetchFeed,
  KEEP_SECONDS,
  latest,
  upstream,
} from "@/lib/imgw-warnings";

// Each copy of the feed lives in Next's data cache (shared by every
// instance) under its upstream and 10-minute slot, so IMGW is asked at most
// once a slot and a failed fetch falls back to the newest slot kept
// (lib/imgw-warnings.ts). The fresh read and the look-back must reach the
// same entry: unstable_cache keys on the callback's source text and the key
// parts, hence one callback text for both.
const reader = (url: string) => (slot: number, load: () => Promise<Feed>) =>
  unstable_cache(() => load(), ["imgw-warnings", url, String(slot)], {
    revalidate: KEEP_SECONDS,
  })();

// After a failed fetch this instance leaves IMGW alone for a minute, so an
// outage costs a page rendered per request (/szukaj) one timeout a minute,
// not one each.
const RETRY_MS = 60_000;
let failedAt = Number.NEGATIVE_INFINITY;

/**
 * The newest copy of the feed (lib/imgw-warnings.ts latest): the banner's,
 * and the weather module's on the address page (lib/modules.ts).
 */
export async function imgwCopy(
  now: number,
): Promise<{ feed: Feed; stale: boolean } | null> {
  const { url, fetch } = await upstream();
  const load = async () => {
    if (now - failedAt < RETRY_MS) throw new Error("failed under a minute ago");
    try {
      return await fetchFeed(url, { fetch });
    } catch (error) {
      failedAt = Date.now();
      throw error;
    }
  };
  return latest(now, reader(url), load);
}

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
// role="alert" banners). Nothing at all when there is no warning, the newest copy is 3
// hours old or older, or anything fails: never an error on every page.
export async function ImgwBanner() {
  const now = Date.now();
  let shown: Banner | null = null;
  try {
    shown = banner(await imgwCopy(now), now);
  } catch (error) {
    console.warn(`IMGW banner: not shown (${(error as Error).message})`);
  }
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
            {several ? (
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
          </div>
        </div>
      </div>
    </div>
  );
}
