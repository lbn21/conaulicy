import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { PageDay } from "@/components/page-day";
import { AddressPage, placeCaption } from "@/components/place-page";
import { unchecked } from "@/lib/hub";
import { indexable } from "@/lib/indexing";
import type { SubpageId } from "@/lib/module-ids";
import { MODULES, type Module } from "@/lib/modules";
import { pageData, SOURCE_TAGS } from "@/lib/page-cache";
import { placePath, titleLabel } from "@/lib/places";
import { getPlace, type PlaceView } from "@/lib/schedule";
import { pageMetadata } from "@/lib/share";

// A module's subpage, /adres/[id]/<module> (lib/modules.ts), the place's
// breadcrumbs in its head's band: one frame for every module (Subpage),
// its body the module's Details. Each subpage has its own route folder
// (app/adres/[id]/smieci/, woda/, prad/), prerendered whole for every
// place, as the address page (components/hub.tsx).

/**
 * Everything a subpage shows: the place and the module's data; null: no
 * such place. One read per render (React's cache()), cached with the page
 * (lib/page-cache.ts) under the module's tags and the dataset's.
 */
const subpageData = cache((id: string, slug: SubpageId) => {
  const module = MODULES[slug] as Module<unknown>;
  return pageData(
    `${placePath(id)}/${slug}`,
    [...new Set([SOURCE_TAGS.dataset, ...module.tags])],
    async () => {
      const [place, data] = await Promise.all([getPlace(id), module.load(id)]);
      return place ? { place, data } : null;
    },
  );
});

/**
 * A subpage's metadata, the same for every module: its own canonical, the
 * title "<h1> – <place>", the module's description of the place; never a
 * search result unless the module says it may be (Module.indexed), its
 * links followed.
 */
export async function subpageMetadata(
  id: string,
  slug: SubpageId,
): Promise<Metadata> {
  const read = await subpageData(id, slug);
  if (!read) notFound();
  const module = MODULES[slug] as Module<unknown>;
  const { place } = read;
  return {
    ...pageMetadata({
      path: `${placePath(id)}/${module.id}`,
      title: `${module.pageTitle} – ${titleLabel(place.label)}`,
      description: module.description(place),
    }),
    ...(!module.indexed?.(place) && {
      robots: { index: false, follow: indexable() },
    }),
  };
}

/** A subpage's content (subpageData), or the 404. */
export async function ModuleMain({
  id,
  slug,
}: {
  id: string;
  slug: SubpageId;
}) {
  const read = await subpageData(id, slug);
  if (!read) notFound();
  return (
    <PageDay day={read.place.today}>
      <Subpage
        module={MODULES[slug] as Module<unknown>}
        place={read.place}
        data={read.data}
      />
    </PageDay>
  );
}

/**
 * Every module's subpage, one frame (components/place-page.tsx
 * AddressPage): the place as the caption, the module's h1; then its body
 * (Module.Details, its source and freshness at the bottom), or, with no
 * data now, the address page's line that it could not be checked
 * (lib/hub.ts unchecked).
 */
export function Subpage({
  module,
  place,
  data,
}: {
  module: Module<unknown>;
  place: PlaceView;
  data: unknown;
}) {
  return (
    <AddressPage
      place={place}
      caption={placeCaption(place)}
      heading={module.pageTitle}
      icon={module.id}
    >
      {/* The module's colours for everything in its body (site.scss
        .app-mod--*): its badges, chips and cards. */}
      <div className={`app-mod app-mod--${module.id}`}>
        {data === null ? (
          <p className="app-empty govuk-body">{unchecked(module)}</p>
        ) : (
          <module.Details data={data} />
        )}
      </div>
    </AddressPage>
  );
}
