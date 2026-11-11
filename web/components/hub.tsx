import { io } from "next/cache";
import { cache, type ReactNode } from "react";
import { subpageHref } from "@/components/function-rows";
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
import { Timeline } from "@/components/timeline";
import { WarningCards } from "@/components/warning-cards";
import { WarsawToday } from "@/components/warsaw-today";
import { MODULE_IDS, SUBPAGE_IDS } from "@/lib/address-routes";
import { freshnessLine, type Group, unchecked } from "@/lib/hub";
import { IMGW_PREVIEW, imgwPreview } from "@/lib/imgw-preview";
import { IMGW_ATTRIBUTION } from "@/lib/imgw-warnings";
import { MODULES, type Module } from "@/lib/modules";
import type { PlaceView } from "@/lib/schedule";
import type { Weather } from "@/lib/weather-module";

// The address page, /adres/[id] (and ?nr=): a date-first hub of modules
// (lib/modules.ts, task 102; task 263), under breadcrumbs. Under „Zmień
// adres”: the lines that belong to no day (each module's notices, in an
// inset); a card per IMGW warning (components/warning-cards.tsx, task
// 288); „Najbliższe 7 dni”, a vertical timeline of every module's items
// by day (components/timeline.tsx, lib/timeline.ts), then „Później”;
// „Wszystko o Twoim adresie”, a link to each module's subpage (/smieci,
// /woda) that has a source; then one small-print note: when each
// module last checked its source, the AI caveat when it applies, and IMGW's
// required wording (task 284; the sources are on the subpages). No
// calendar or PDF here: they are on the waste subpage. A split street's
// number errors keep the street page (StreetPage), GOV.UK's validation
// pattern.
//
// The page is read per request, whole, behind one <Suspense> with one
// skeleton (components/place-suspense.tsx; Jakub's decision, task 239):
// every block's data at once (hubData), so it all comes in together, each
// module's check time from the same read. Its static shell
// holds only the skeleton: no date and no waste type is ever prerendered.
// Dates are absolute; „Dziś” and „Jutro” come with them, for the read's
// Warsaw day (WarsawToday, place.today), then the device's
// (components/warsaw-today.tsx).

/**
 * Everything the address page shows, read per request (after io(), so
 * nothing date-dependent is ever prerendered: task 239), every module's
 * data at once (Promise.all), so the page waits for the slowest block, not
 * the sum. React's cache() makes it one read per request for the page and
 * its breadcrumbs (components/place-crumbs.tsx), so both come in together
 * (react.dev/reference/react/cache). In registry order; the first, waste's,
 * is the place itself.
 */
export const hubData = cache(
  async (id: string, nr: string | null, imgw: string | null = null) => {
    await io();
    return (await Promise.all(
      MODULE_IDS.map((slug) => MODULES[slug].load(id, nr, imgw)),
    )) as [PlaceView | null, ...unknown[]];
  },
);

/** The page's ?imgw= as the mock's URL (lib/imgw-preview.ts), or null. */
export async function imgwQuery(searchParams: AddressSearch) {
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
  /** The page's, for its ?nr= (numberQuery). */
  searchParams: AddressSearch;
  /** What an unknown place shows. */
  unknown: ReactNode;
}) {
  // An unknown place: its 404 before anything is read per request.
  if (!(await knownPlace(id))) return <>{unknown}</>;
  const { nr, missing } = await numberQuery(searchParams);
  const data = await hubData(id, nr, await imgwQuery(searchParams));
  const place = data[0];
  if (!place) return <>{unknown}</>;
  return (
    <WarsawToday day={place.today}>
      {numberError(place, missing) ? (
        <StreetPage place={place} missing={missing} />
      ) : (
        <Hub data={data} place={place} />
      )}
    </WarsawToday>
  );
}

/** The address page's blocks, as HubMain (task 263); `data` hubData's. */
export function Hub({ data, place }: { data: unknown[]; place: PlaceView }) {
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
  const now = Date.now();
  return (
    <AddressPage place={place}>
      {notices.length > 0 && (
        <div className="govuk-inset-text">
          <Status groups={notices} />
        </div>
      )}
      <WarningCards warnings={weather?.shown?.warnings ?? []} now={now} />
      <Timeline items={items} place={place} now={now} />
      {links.length > 0 && (
        <section aria-labelledby="wszystko">
          <h2 id="wszystko" className="govuk-heading-m">
            Wszystko o Twoim adresie
          </h2>
          <ul className="govuk-list">
            {links.map(({ module }) => (
              <li key={module.id}>
                <PlaceLink
                  className="govuk-link"
                  href={subpageHref(module, place)}
                >
                  {module.more}
                </PlaceLink>
              </li>
            ))}
          </ul>
        </section>
      )}
      {/* Small print at the end, above the footer (task 284): when each
        module last checked its source, the AI caveat when it applies, and
        IMGW's required wording. The sources are on the subpages. */}
      <p className="govuk-hint govuk-!-font-size-16">
        {[
          freshnessLine(
            loaded.map(({ module, data }) => ({
              name: module.title,
              at: module.checkedAt(data),
            })),
          ),
          ...loaded.map(({ module, data }) => module.note?.(data)),
          ...IMGW_ATTRIBUTION,
        ]
          .filter(Boolean)
          .join(" ")}
      </p>
    </AddressPage>
  );
}
