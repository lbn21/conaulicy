import { io } from "next/cache";
import { cache, type ReactNode } from "react";
import { subpageHref } from "@/components/function-rows";
import { Parts, Status } from "@/components/parts";
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
import { WarsawToday } from "@/components/warsaw-today";
import { MODULE_IDS } from "@/lib/address-routes";
import { type Group, metaLine } from "@/lib/hub";
import { IMGW_ATTRIBUTION } from "@/lib/imgw-warnings";
import { MODULES, type Module } from "@/lib/modules";
import type { PlaceView } from "@/lib/schedule";

// The address page, /adres/[id] (and ?nr=): the hub of modules
// (lib/modules.ts, task 102), under breadcrumbs. Under „Zmień
// adres”, „Najbliższe dni” (components/upcoming.tsx), every module's items
// in one order (or that nothing is coming); then a section per module, always,
// in registry order (Śmieci, Woda, Pogoda; task 207), each its module's id
// as its anchor (#woda): its h2, its status lines (only what „Najbliższe
// dni” does not say, task 257: each cut and warning is listed there
// alone), a link saying where its subpage goes („Wszystkie odbiory
// śmieci”), then its meta line, small: „Źródło: …”, and when we checked.
// No summary lists or cards (GOV.UK keeps cards for lists of the same type
// of thing, task 131). A visible section break between sections. No
// calendar or PDF here: they are on the waste subpage. A split street's
// number errors keep the street page (StreetPage), GOV.UK's validation
// pattern.
//
// The page is read per request, whole, behind one <Suspense> with one
// skeleton (components/place-suspense.tsx; Jakub's decision, task 239):
// every block's data at once (hubData), so it all comes in together, each
// live module with its „Sprawdziliśmy” from the same read. Its static shell
// holds only the skeleton: no date and no waste type is ever prerendered.
// Dates are absolute; „Dziś” and „Jutro” come with them, for the read's
// Warsaw day (WarsawToday, place.today), then the device's
// (components/warsaw-today.tsx).

// The old hub's section parts, kept only until its tests are rewritten
// (TODO t263: remove with hub.test.ts).
type Loaded = { module: Module<unknown>; data: unknown };

/**
 * A module's section body: its status, the link to its subpage (if it has
 * one), then its meta line, last.
 */
export function ModuleBody({
  loaded: { module, data },
  place,
}: {
  loaded: Loaded;
  place: PlaceView;
}) {
  const sources = module.sources(data);
  const meta = metaLine(
    sources,
    module.note?.(data) ?? null,
    module.checkedAt?.(data) ?? null,
  );
  return (
    <>
      {module.Status ? (
        <module.Status data={data} />
      ) : (
        <Status groups={module.status(data)} />
      )}
      {/* No source: nothing for the subpage to detail. */}
      {module.Details && sources.length > 0 && (
        <p className="govuk-body">
          <PlaceLink className="govuk-link" href={subpageHref(module, place)}>
            {module.more}
          </PlaceLink>
        </p>
      )}
      {meta.length > 0 && (
        <p className="govuk-body-s">
          <Parts parts={meta} lead />
        </p>
      )}
    </>
  );
}

/** A module's section: its h2, then its body (ModuleBody, or a live block). */
export function ModuleSection({
  module,
  children,
}: {
  module: Module<unknown>;
  children?: ReactNode;
}) {
  const heading = `${module.id}-heading`;
  return (
    <section id={module.id} aria-labelledby={heading}>
      <h2 id={heading} className="govuk-heading-l">
        {module.title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Everything the address page shows, read per request (after io(), so
 * nothing date-dependent is ever prerendered: task 239), every module's
 * data at once (Promise.all), so the page waits for the slowest block, not
 * the sum. React's cache() makes it one read per request for the page and
 * its breadcrumbs (components/place-crumbs.tsx), so both come in together
 * (react.dev/reference/react/cache). In registry order; the first, waste's,
 * is the place itself.
 */
export const hubData = cache(async (id: string, nr: string | null) => {
  await io();
  return (await Promise.all(
    MODULE_IDS.map((slug) => MODULES[slug].load(id, nr)),
  )) as [PlaceView | null, ...unknown[]];
});

/**
 * The address page's content (hubData), whole, behind the page's one
 * <Suspense> (components/place-suspense.tsx): „Najbliższe dni”, then every
 * module's section. `unknown` (PlaceNotFound) is what an unknown place
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
  const data = await hubData(id, nr);
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

/** The address page's blocks, as HubMain (task 263). */
function Hub({ data, place }: { data: unknown[]; place: PlaceView }) {
  const modules = MODULE_IDS.map((slug): Module<unknown> => MODULES[slug]);
  const items = modules.flatMap((module, i) =>
    data[i] === null ? [] : module.upcoming(data[i]),
  );
  // Lines that belong to no day; a live module not checked says so, so
  // an empty day never claims „nothing” for it.
  const notices: Group[] = modules.flatMap((module, i) =>
    data[i] === null
      ? module.live
        ? [[[`Nie udało się sprawdzić ${module.subject}.`]]]
        : []
      : module.notices(data[i]),
  );
  const loaded = modules.flatMap((module, i) =>
    data[i] === null ? [] : [{ module, data: data[i] }],
  );
  const links = loaded.filter(
    ({ module, data }) => module.Details && module.sources(data).length > 0,
  );
  return (
    <AddressPage place={place}>
      {notices.length > 0 && (
        <div className="govuk-inset-text">
          <Status groups={notices} />
        </div>
      )}
      <Timeline items={items} place={place} now={Date.now()} />
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
                  {module.Details ? module.more : null}
                </PlaceLink>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="skad-to-wiemy">
        <h2 id="skad-to-wiemy" className="govuk-heading-m">
          Skąd to wiemy
        </h2>
        {loaded.map(({ module, data }) => {
          const meta = metaLine(
            module.sources(data),
            module.note?.(data) ?? null,
            module.checkedAt?.(data) ?? null,
          );
          if (meta.length === 0) return null;
          return (
            <p key={module.id} className="govuk-body-s">
              <strong>{module.title}.</strong> <Parts parts={meta} lead />
            </p>
          );
        })}
        {/* IMGW's required wording, as secondary text (task 205). */}
        <p className="govuk-hint govuk-!-font-size-16">
          {IMGW_ATTRIBUTION.join(" ")}
        </p>
      </section>
    </AddressPage>
  );
}
