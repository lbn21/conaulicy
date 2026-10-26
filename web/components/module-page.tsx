import type { Metadata } from "next";
import { PageMain } from "@/components/page-main";
import { NOT_FOUND_METADATA } from "@/components/page-not-found";
import { PlaceBreadcrumbs, PlaceNotFound } from "@/components/place-page";
import { findSubpage } from "@/lib/modules";
import { getPlace } from "@/lib/schedule";

// A module's subpage, /adres/[id]/[module] (lib/modules.ts), with the same
// house-number and /numer variants as the address page
// (lib/address-routes.ts), under the place's breadcrumbs (before <main>), the
// same for every module. An unknown module, or one without a subpage (the weather), is a
// 404. Canonical: the subpage itself.

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

export async function ModuleMain({
  id,
  slug,
  nr,
  missing = false,
}: {
  id: string;
  slug: string;
  nr: string | null;
  missing?: boolean;
}) {
  const module = findSubpage(slug);
  const [place, data] = await Promise.all([
    getPlace(id, nr),
    module?.load(id, nr),
  ]);
  if (!module || !place || !data) return <PlaceNotFound />;
  return (
    <>
      <PlaceBreadcrumbs place={place} subpage />
      <PageMain>
        <module.Details
          data={data}
          missing={missing}
          checkedAt={module.checkedAt?.(data) ?? null}
        />
      </PageMain>
    </>
  );
}
