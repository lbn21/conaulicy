import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Badge } from "@/components/badge";
import { subpageHref } from "@/components/function-rows";
import { Icon, Tile } from "@/components/icon";
import { ImgwSource } from "@/components/imgw-source";
import { NowBanner } from "@/components/now-banner";
import { PageDay } from "@/components/page-day";
import { Status } from "@/components/parts";
import { AddressPage } from "@/components/place-page";
import { SourceNote } from "@/components/subpage-parts";
import { Timeline } from "@/components/timeline";
import { WarningCards } from "@/components/warning-cards";
import { hubPage } from "@/lib/address-pages";
import { MODULE_IDS, SUBPAGE_IDS } from "@/lib/address-routes";
import { freshnessLine, type Group, unchecked } from "@/lib/hub";
import { MODULES, type Module } from "@/lib/modules";
import { pageData } from "@/lib/page-cache";
import type { PlaceView } from "@/lib/schedule";
import { days, onDay } from "@/lib/timeline";
import type { Item } from "@/lib/upcoming";
import type { Weather } from "@/lib/weather-module";

// The address page, /adres/[id]: a date-first hub of modules
// (lib/modules.ts), its breadcrumbs in its head's band. Under „Zmień
// adres”: the lines that belong to no day (each module's notices, in an
// inset); a card per IMGW warning (components/warning-cards.tsx);
// „Najbliższe 7 dni”, a vertical timeline of every module's items
// by day (components/timeline.tsx, lib/timeline.ts), then „Później”;
// „Wszystko o Twoim adresie”, a link to each module's subpage (/smieci,
// /woda) that has a source; then one small-print note: when the live
// sources' data last changed, and IMGW's required wording when its
// data was read (the sources and the AI caveat are on the subpages). No
// calendar or PDF here: they are on the waste subpage.
//
// Prerendered whole at build for every place (app/adres/[id]/page.tsx),
// every module's data in one cache scope (hubData, lib/page-cache.ts):
// re-rendered only when what it shows changes (lib/page-refresh.ts).
// Dates are absolute; „Dziś” and „Jutro” come with them, for the
// render's Warsaw day (components/page-day.tsx).

const MODULE_LIST = MODULE_IDS.map((slug): Module<unknown> => MODULES[slug]);

/**
 * Everything the address page shows (lib/pages.ts hubPage) and the clock
 * it was read at. One read per render (React's cache()), cached with the
 * page (pageData).
 */
export const hubData = cache((id: string) => pageData(hubPage(id)));

/** The address page's content (hubData), or the 404. */
export async function HubMain({ id }: { id: string }) {
  const { now, view: data } = await hubData(id);
  if (!data) notFound();
  const place = data[0] as PlaceView;
  return (
    <PageDay day={place.today}>
      <Hub data={data} place={place} now={now} />
    </PageDay>
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
  const modules = MODULE_LIST;
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
  const imgw = weather?.read === true;
  const counts = windowCounts(items, place.today, now);
  const fresh = freshnessLine(
    loaded.map(({ module, data }) => ({
      name: module.title,
      changedAt: module.changedAt(data),
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
                      <Link
                        className="govuk-link govuk-link--text-colour govuk-link--no-underline app-item__link"
                        href={subpageHref(module, place)}
                      >
                        {module.more}
                      </Link>
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
        above the footer, only what a resident needs: when each live
        source's data last changed, and, when IMGW's
        data was read, its required wording, its name linked: the weather
        has no subpage, so its source link is here. The other sources and
        the AI caveat are on the subpages. */}
      <SourceNote source={imgw && <ImgwSource />} fresh={fresh} />
    </AddressPage>
  );
}
