import { cacheLife, cacheTag, io } from "next/cache";
import { Fragment, type ReactNode } from "react";
import { BlockSkeleton, LiveBlock } from "@/components/live-block";
import { Parts, Status } from "@/components/parts";
import { AddressPage, numberError, StreetPage } from "@/components/place-page";
import { Skeleton } from "@/components/skeleton";
import { Upcoming } from "@/components/upcoming";
import { MODULE_IDS, type ModuleId } from "@/lib/address-routes";
import { metaLine } from "@/lib/hub";
import { IMGW_ATTRIBUTION } from "@/lib/imgw-warnings";
import { MODULES, type Module } from "@/lib/modules";
import { placePath } from "@/lib/places";
import { getPlace, PLACE_TAGS, type PlaceView } from "@/lib/schedule";
import { ordered } from "@/lib/upcoming";

// The address page, /adres/[id] (and /nr/…): the hub of modules
// (lib/modules.ts, docs/tasks T102), under breadcrumbs. Under „Zmień
// adres”, „Najbliższe dni” (components/upcoming.tsx), every module's items
// in one order, only while one is shown; then a section per module, always,
// in registry order (Śmieci, Woda, Pogoda; task 207), each its module's id
// as its anchor (#woda): its h2, its status lines (what is next, or that
// nothing is), a link saying where its subpage goes („Wszystkie odbiory
// śmieci”), then its meta line, small: „Źródło: …”, and when we checked.
// No summary lists or cards (GOV.UK keeps cards for lists of the same type
// of thing, task 131). A visible section break between sections. No
// calendar or PDF here: they are on the waste subpage. A split street's
// number errors keep the street page (StreetPage), GOV.UK's validation
// pattern.
//
// The page is a static shell, cached until the next import or deploy
// (HubMain, cacheLife "max", tagged with the dataset the import purges):
// the frame, the waste section, every section's heading. What changes
// between imports is read per request, each block in its own hole with its
// skeleton (components/live-block.tsx): „Najbliższe dni” and every live
// module's section body (water, weather), each with its „Sprawdziliśmy”
// from the same read. Dates are absolute; „Dziś” and „Jutro” are the
// device's (components/day-word.tsx).

type Loaded = { module: Module<unknown>; data: unknown };

/** A module's subpage, with the number as given (its breadcrumb back here). */
const subpageHref = (module: Module<unknown>, place: PlaceView) =>
  `${placePath(place.id)}/${module.id}${place.givenNr ? `?nr=${place.givenNr}` : ""}`;

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
          <a className="govuk-link" href={subpageHref(module, place)}>
            {module.more}
          </a>
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

// GOV.UK's visible section break, between the hub's sections.
const BREAK = (
  <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />
);

/** A live module whose data cannot be read yet (none written so far). */
const NOT_CHECKED = "Jeszcze tego nie sprawdziliśmy.";

/**
 * A live module's section body, read per request (after io(), so never in
 * the shell), its „Sprawdziliśmy” from the same read as its data.
 */
async function ModuleLive({
  slug,
  id,
  nr,
}: {
  slug: ModuleId;
  id: string;
  nr: string | null;
}) {
  await io();
  const module: Module<unknown> = MODULES[slug];
  const [place, data] = await Promise.all([
    getPlace(id, nr),
    module.load(id, nr),
  ]);
  // No such place: the shell around this answers 404.
  if (!place) return null;
  if (data === null) return <p className="govuk-body">{NOT_CHECKED}</p>;
  return <ModuleBody loaded={{ module, data }} place={place} />;
}

/**
 * „Najbliższe dni”, read per request: every module's items (waste's from
 * the dataset, the rest from their live files), those not over now.
 */
async function UpcomingLive({ id, nr }: { id: string; nr: string | null }) {
  await io();
  const modules = MODULE_IDS.map((slug): Module<unknown> => MODULES[slug]);
  const data = await Promise.all(modules.map((module) => module.load(id, nr)));
  if (data[0] === null) return null;
  const items = ordered(
    modules.flatMap((module, i) =>
      data[i] === null ? [] : module.upcoming(data[i]),
    ),
  );
  return <Upcoming items={items} now={Date.now()} />;
}

// The typical shapes the skeletons reserve (Jakub's decision, 31 Oct 2026:
// shifts on reveal accepted for more or less content). „Najbliższe dni” is
// as often empty as not: its heading's line only.
const UPCOMING_SKELETON = (
  <BlockSkeleton>
    <p className="govuk-heading-m">
      <Skeleton>Najbliższe dni</Skeleton>
    </p>
  </BlockSkeleton>
);

/** A live module's section body, typical: its status line, link and meta. */
function sectionSkeleton(module: Module<unknown>) {
  return (
    <BlockSkeleton>
      <p className="govuk-body">
        <Skeleton>{module.typical ?? ""}</Skeleton>
      </p>
      {module.Details && (
        <p className="govuk-body">
          <Skeleton>{module.more}</Skeleton>
        </p>
      )}
      <p className="govuk-body-s">
        <Skeleton>
          Źródło: komunikaty. Sprawdziliśmy 31 października, 14:20.
        </Skeleton>
      </p>
    </BlockSkeleton>
  );
}

/** The address page's live blocks for HubMain, each its own hole. */
export function hubLive(id: string, nr: string | null) {
  return {
    upcoming: (
      <LiveBlock skeleton={UPCOMING_SKELETON}>
        <UpcomingLive id={id} nr={nr} />
      </LiveBlock>
    ),
    sections: Object.fromEntries(
      MODULE_IDS.filter((slug) => MODULES[slug].live).map((slug) => [
        slug,
        <LiveBlock key={slug} skeleton={sectionSkeleton(MODULES[slug])}>
          <ModuleLive slug={slug} id={id} nr={nr} />
        </LiveBlock>,
      ]),
    ) as Partial<Record<ModuleId, ReactNode>>,
  };
}

/**
 * The address page's static shell, cached (`use cache`, cacheLife "max":
 * until the import's purge of the dataset tag, or the next deploy): the
 * page's params are awaited outside and passed in; `unknown`
 * (PlaceNotFound) and the live blocks (hubLive) pass through uncached, so
 * notFound() is thrown in the page's own render and the blocks are read per
 * request.
 */
export async function HubMain({
  id,
  nr,
  missing = false,
  unknown,
  upcoming,
  sections,
}: {
  id: string;
  nr: string | null;
  /** ?nr= was sent without a usable number (/adres/[id]/numer). */
  missing?: boolean;
  /** What an unknown place shows. */
  unknown: ReactNode;
  /** hubLive's blocks. */
  upcoming: ReactNode;
  sections: Partial<Record<ModuleId, ReactNode>>;
}) {
  "use cache";
  cacheLife("max");
  cacheTag(...PLACE_TAGS);
  const modules = MODULE_IDS.map((slug): Module<unknown> => MODULES[slug]);
  // The modules that change only with an import, in the shell; the first,
  // waste, is the place itself.
  const [place, ...rest] = (await Promise.all(
    modules.map((module, i) =>
      i === 0 || !module.live ? module.load(id, nr) : null,
    ),
  )) as [PlaceView | null, ...unknown[]];
  if (!place) return <>{unknown}</>;
  if (numberError(place, missing)) {
    return <StreetPage place={place} missing={missing} />;
  }
  return (
    <AddressPage place={place}>
      {upcoming}
      {modules.map((module, i) => {
        const data = i === 0 ? place : rest[i - 1];
        // A module with nothing we may show is left out (lib/modules.ts load).
        if (!module.live && data === null) return null;
        return (
          <Fragment key={module.id}>
            {i > 0 && BREAK}
            <ModuleSection module={module}>
              {module.live ? (
                sections[module.id]
              ) : (
                <ModuleBody loaded={{ module, data }} place={place} />
              )}
            </ModuleSection>
          </Fragment>
        );
      })}
      {/* IMGW's required wording, as secondary text (task 205). */}
      <p className="govuk-hint govuk-!-font-size-16">
        {IMGW_ATTRIBUTION.join(" ")}
      </p>
    </AddressPage>
  );
}
