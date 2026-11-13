import { cacheLife, cacheTag } from "next/cache";
import type { ReactNode } from "react";
import { Badge } from "@/components/badge";
import { subpageHref } from "@/components/function-rows";
import { Icon, Tile } from "@/components/icon";
import { NowBanner } from "@/components/now-banner";
import { Status } from "@/components/parts";
import { PlaceLink } from "@/components/place-link";
import {
  AddressPage,
  type AddressSearch,
  knownPlace,
  numberError,
  numberQuery,
  StreetPage,
} from "@/components/place-page";
import { SourceNote } from "@/components/subpage-parts";
import { Timeline } from "@/components/timeline";
import { WarningCards } from "@/components/warning-cards";
import { WarsawToday } from "@/components/warsaw-today";
import { MODULE_IDS, SUBPAGE_IDS } from "@/lib/address-routes";
import { LIVE } from "@/lib/headers";
import { freshnessLine, type Group, unchecked } from "@/lib/hub";
import { IMGW_PREVIEW, imgwPreview } from "@/lib/imgw-preview";
import { IMGW_PAGE } from "@/lib/imgw-shown";
import { IMGW_ATTRIBUTION, IMGW_NAME } from "@/lib/imgw-warnings";
import { MODULES, type Module } from "@/lib/modules";
import { PLACE_TAGS, type PlaceView } from "@/lib/schedule";
import { days, onDay } from "@/lib/timeline";
import type { Item } from "@/lib/upcoming";
import type { Weather } from "@/lib/weather-module";

// The address page, /adres/[id] (and ?nr=): a date-first hub of modules
// (lib/modules.ts), its breadcrumbs in its head's band. Under „Zmień
// adres”: the lines that belong to no day (each module's notices, in an
// inset); a card per IMGW warning (components/warning-cards.tsx);
// „Najbliższe 7 dni”, a vertical timeline of every module's items
// by day (components/timeline.tsx, lib/timeline.ts), then „Później”;
// „Wszystko o Twoim adresie”, a link to each module's subpage (/smieci,
// /woda) that has a source; then one small-print note: when each
// module last checked its source, and IMGW's required wording when its
// data was read (the sources and the AI caveat are on the subpages). No
// calendar or PDF here: they are on the waste subpage. A split street's
// number errors keep the street page (StreetPage), GOV.UK's validation
// pattern.
//
// The page is prerendered whole, per place (its route's
// generateStaticParams): every block's data at once (hubData), cached as
// "live" (next.config.ts), so the HTML of a load holds the page itself, no
// skeleton, and each module's check time comes from the same read. Its
// <Suspense> (components/place-suspense.tsx) shows the skeleton only on a
// client-side navigation the prefetch has not filled, and for ?nr= and
// ?imgw=, the request's own input, read per request on their routes under
// app/adres/[id]/nr/ (proxy.ts sends them there). Dates are absolute;
// „Dziś” and „Jutro” come with them, for the read's Warsaw day
// (WarsawToday, place.today), then the device's
// (components/warsaw-today.tsx).

/**
 * Everything the address page shows, every module's data at once
 * (Promise.all), cached as "live": its clock (`now`, the timeline's and
 * the warnings') is the cache's fill. In registry order; the first,
 * waste's, is the place itself.
 */
async function hubData(id: string, nr: string | null, imgw: string | null) {
  "use cache";
  cacheLife("live");
  cacheTag(LIVE, ...PLACE_TAGS);
  const data = (await Promise.all(
    MODULE_IDS.map((slug) => MODULES[slug].load(id, nr, imgw)),
  )) as [PlaceView | null, ...unknown[]];
  return { now: Date.now(), data };
}

/** The page's ?imgw= as the mock's URL (lib/imgw-preview.ts), or null. */
async function imgwQuery(searchParams: AddressSearch) {
  return imgwPreview((await searchParams)[IMGW_PREVIEW]);
}

/**
 * The address page's content (hubData), whole, behind the page's one
 * <Suspense> (components/place-suspense.tsx): Hub, or the street page's
 * number errors. `unknown` (PlaceNotFound) is what an unknown place
 * shows.
 */
export async function HubMain({
  id,
  searchParams,
  unknown,
}: {
  id: string;
  /** The ?nr= and ?imgw= route's (numberQuery); none: the place alone. */
  searchParams: AddressSearch | null;
  /** What an unknown place shows. */
  unknown: ReactNode;
}) {
  // An unknown place: its 404 before ?nr= is read.
  if (!(await knownPlace(id))) return <>{unknown}</>;
  const { nr, missing } = searchParams
    ? await numberQuery(searchParams)
    : { nr: null, missing: false };
  const imgw = searchParams ? await imgwQuery(searchParams) : null;
  const { now, data } = await hubData(id, nr, imgw);
  const place = data[0];
  if (!place) return <>{unknown}</>;
  return (
    <WarsawToday day={place.today}>
      {numberError(place, missing) ? (
        <StreetPage place={place} missing={missing} />
      ) : (
        <Hub data={data} place={place} now={now} />
      )}
    </WarsawToday>
  );
}

/** The timeline's window, in days (components/timeline.tsx). */
const WINDOW = 7;

/**
 * Each module's count of items in the timeline's window, by module id: an
 * item over several days counted once.
 */
function windowCounts(items: Item[], today: string, now: number) {
  const shown = new Set(
    days(today, WINDOW).flatMap((day) =>
      onDay(items, day, now).map(({ item }) => item),
    ),
  );
  const counts = new Map<string, number>();
  for (const item of shown)
    counts.set(item.module, (counts.get(item.module) ?? 0) + 1);
  return counts;
}

/**
 * A module card's count: a badge when something is in the window; none,
 * plain grey text (an empty state is never a pill).
 */
function CountBadge({ count }: { count: number }) {
  return count > 0 ? (
    <Badge tone="mod">
      {count} w ciągu {WINDOW} dni
    </Badge>
  ) : (
    <span className="govuk-body-s govuk-!-margin-bottom-0 app-quiet">
      Nic w ciągu {WINDOW} dni
    </span>
  );
}

/** The address page's blocks, as HubMain; `data` and `now` hubData's. */
export function Hub({
  data,
  place,
  now,
}: {
  data: unknown[];
  place: PlaceView;
  now: number;
}) {
  const modules = MODULE_IDS.map((slug): Module<unknown> => MODULES[slug]);
  const items = modules.flatMap((module, i) =>
    data[i] === null ? [] : module.upcoming(data[i]),
  );
  // Lines that belong to no day; a module not checked says so, so an
  // empty day never claims „nothing” for it.
  const notices: Group[] = modules.flatMap((module, i) =>
    data[i] === null ? [[[unchecked(module)]]] : module.notices(data[i]),
  );
  const loaded = modules.flatMap((module, i) =>
    data[i] === null ? [] : [{ module, data: data[i] }],
  );
  const links = loaded.filter(
    ({ module, data }) =>
      SUBPAGE_IDS.includes(module.id) && module.sources(data).length > 0,
  );
  const weather = data[MODULE_IDS.indexOf("pogoda")] as Weather | null;
  // IMGW's data was read: its required wording in the small print.
  const imgw = weather?.checkedAt != null;
  const counts = windowCounts(items, place.today, now);
  const fresh = freshnessLine(
    loaded.map(({ module, data }) => ({
      name: module.title,
      at: module.checkedAt(data),
    })),
  );
  return (
    <AddressPage place={place}>
      <NowBanner items={items} place={place} now={now} />
      {notices.length > 0 && (
        <div className="govuk-inset-text">
          <Status groups={notices} />
        </div>
      )}
      <WarningCards warnings={weather?.shown?.warnings ?? []} now={now} />
      <Timeline items={items} place={place} now={now} n={WINDOW} />
      {links.length > 0 && (
        <section aria-labelledby="wszystko">
          <h2 id="wszystko" className="govuk-heading-m">
            Wszystko o Twoim adresie
          </h2>
          {/* A card per module (site.scss .app-items): its icon on its
            colour's tile, its title, a plain heading whose one link
            stretches over the whole card (the link's name the title), how
            many of its items are in the window, a chevron. A card with
            nothing in the window is muted: its title regular, its tile
            grey (Tile muted), so it never draws the eye as one with
            something does; the same size, still a link. */}
          <ul className="app-items">
            {links.map(({ module }) => {
              const empty = (counts.get(module.id) ?? 0) === 0;
              return (
                <li
                  key={module.id}
                  className={`app-item app-mod app-mod--${module.id}`}
                >
                  <Tile name={module.id} muted={empty} />
                  <div className="app-item__body">
                    <h3
                      className={`govuk-heading-s govuk-!-margin-bottom-0 ${empty ? "govuk-!-font-weight-regular" : ""}`.trim()}
                    >
                      <PlaceLink
                        className="govuk-link govuk-link--text-colour govuk-link--no-underline app-item__link"
                        href={subpageHref(module, place)}
                      >
                        {module.more}
                      </PlaceLink>
                    </h3>
                    <CountBadge count={counts.get(module.id) ?? 0} />
                  </div>
                  <Icon name="chevron" />
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {/* The source note at the end (SourceNote, as every subpage's),
        above the footer, only what a resident needs: when each module last checked its source, and, when IMGW's
        data was read, its required wording, its name linked: the weather
        has no subpage, so its source link is here. The other sources and
        the AI caveat are on the subpages. */}
      <SourceNote
        source={
          imgw && (
            <>
              {IMGW_ATTRIBUTION.source[0]}
              <a className="govuk-link" href={IMGW_PAGE}>
                {IMGW_NAME}
              </a>
              {`${IMGW_ATTRIBUTION.source[1]} ${IMGW_ATTRIBUTION.processed}`}
            </>
          )
        }
        checked={fresh}
      />
    </AddressPage>
  );
}
