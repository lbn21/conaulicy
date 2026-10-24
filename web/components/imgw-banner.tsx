import { unstable_cache } from "next/cache";
import { type Banner, banner } from "@/lib/imgw-banner";
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

async function current(now: number): Promise<Banner | null> {
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
  return banner(await latest(now, reader(url), load), now);
}

function Item({ warning }: { warning: Banner["warnings"][number] }) {
  return (
    <>
      <h3 className="govuk-notification-banner__heading">
        {warning.event} <strong className={warning.tag}>{warning.level}</strong>
      </h3>
      <p className="govuk-body">{warning.when}</p>
      <p className="govuk-body">{warning.details}</p>
    </>
  );
}

// IMGW's meteo warnings for the powiat (docs/data/imgw.md), on every page
// above its h1 (app/layout.tsx): GOV.UK's notification banner, neutral, as
// govuk-frontend 6.5.1's template. Server-rendered, no client JS (its
// data-module is not initialised: GOV.UK's script only focuses role="alert"
// banners). Nothing at all when there is no warning, the newest copy is 3
// hours old or older, or anything fails: never an error on every page.
export async function ImgwBanner() {
  const now = Date.now();
  let shown: Banner | null = null;
  try {
    shown = await current(now);
  } catch (error) {
    console.warn(`IMGW banner: not shown (${(error as Error).message})`);
  }
  if (!shown) return null;
  const [first, ...more] = shown.warnings;
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
            {more.length === 0 ? (
              <Item warning={first} />
            ) : (
              <ul className="govuk-list">
                {shown.warnings.map((warning) => (
                  <li key={warning.id}>
                    <Item warning={warning} />
                  </li>
                ))}
              </ul>
            )}
            <p className="govuk-body">
              <a
                className="govuk-notification-banner__link"
                href="https://meteo.imgw.pl/"
              >
                Szczegóły i mapa na meteo.imgw.pl
              </a>
            </p>
            <p className="govuk-body-s">{shown.footer}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
