import type { Metadata } from "next";
import { cacheLife, cacheTag, io } from "next/cache";
import type { ReactNode } from "react";
import { BlockSkeleton, LiveBlock } from "@/components/live-block";
import { NOT_FOUND_METADATA } from "@/components/page-not-found";
import { SubpageHeading } from "@/components/place-page";
import { Skeleton } from "@/components/skeleton";
import { findSubpage } from "@/lib/modules";
import { getPlace, PLACE_TAGS } from "@/lib/schedule";

// A module's subpage, /adres/[id]/[module] (lib/modules.ts), with the same
// house-number and /numer variants as the address page
// (lib/address-routes.ts), under the place's breadcrumbs (before <main>), the
// same for every module. An unknown module, or one without a subpage (the weather), is a
// 404. Canonical: the subpage itself. A static shell cached until the next
// import or deploy, as the address page (components/hub.tsx): the waste
// subpage whole; a live module's (water) its frame and heading, its body
// read per request in its own hole (moduleLive).

export async function moduleMetadata(
  id: string,
  slug: string,
  nr: string | null,
  missing = false,
): Promise<Metadata> {
  const module = findSubpage(slug);
  // As placeMetadata: Next.js's own noindex is the only robots tag.
  if (!module) return NOT_FOUND_METADATA;
  return module.metadata(id, nr, missing);
}

/**
 * A live module's subpage body, read per request (after io(), so never in
 * the shell): its checked line, from the same read as its data, then the
 * rest (Module.Details).
 */
async function ModuleLive({
  slug,
  id,
  nr,
}: {
  slug: string;
  id: string;
  nr: string | null;
}) {
  await io();
  const module = findSubpage(slug);
  const data = await module?.load(id, nr);
  // No such place: the shell around this answers 404.
  if (!module || !data) return null;
  return (
    <module.Details data={data} checkedAt={module.checkedAt?.(data) ?? null} />
  );
}

// A live subpage's typical shape: its checked line and one paragraph (no
// cut planned, the usual state); bare, so the page's fallback draws it too
// (components/place-suspense.tsx).
export const LIVE_SHAPE = (
  <>
    <p className="govuk-hint govuk-!-font-size-16">
      <Skeleton>
        Komunikaty o wodzie sprawdziliśmy: 31 października, 14:20
      </Skeleton>
    </p>
    <p className="govuk-body">
      <Skeleton>
        Brak zapowiedzianych przerw w dostawie wody. Sprawdzamy komunikaty gminy
        i MZGKiM.
      </Skeleton>
    </p>
  </>
);

/** A live module's subpage body for ModuleMain, its own hole. */
export function moduleLive(id: string, slug: string, nr: string | null) {
  return (
    <LiveBlock skeleton={<BlockSkeleton>{LIVE_SHAPE}</BlockSkeleton>}>
      <ModuleLive slug={slug} id={id} nr={nr} />
    </LiveBlock>
  );
}

/**
 * A subpage's static shell, cached as the address page's (components/hub.tsx
 * HubMain): cacheLife "max", the dataset's tags; `unknown` and `live`
 * (moduleLive) pass through uncached.
 */
export async function ModuleMain({
  id,
  slug,
  nr,
  missing = false,
  unknown,
  live,
}: {
  id: string;
  slug: string;
  nr: string | null;
  missing?: boolean;
  /** What an unknown place or module shows. */
  unknown: ReactNode;
  /** A live module's body (moduleLive). */
  live: ReactNode;
}) {
  "use cache";
  cacheLife("max");
  cacheTag(...PLACE_TAGS);
  const module = findSubpage(slug);
  const [place, data] = await Promise.all([
    getPlace(id, nr),
    module && !module.live ? module.load(id, nr) : null,
  ]);
  if (!module || !place || (!module.live && !data)) return <>{unknown}</>;
  // Its breadcrumbs: the layout's @breadcrumbs slot (components/place-crumbs.tsx).
  return (
    <>
      {module.live ? (
        <div className="govuk-grid-row">
          <div className="govuk-grid-column-two-thirds">
            <SubpageHeading place={place} heading={module.pageTitle} />
            {live}
          </div>
        </div>
      ) : (
        <module.Details
          data={data}
          missing={missing}
          checkedAt={module.checkedAt?.(data) ?? null}
        />
      )}
    </>
  );
}
