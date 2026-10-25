import type { Metadata } from "next";
import { NOT_FOUND_TITLE } from "@/components/page-not-found";
import { PlaceNotFound, placeMetadata } from "@/components/place-page";
import { findModule } from "@/lib/modules";

// A module's subpage, /adres/[id]/[module] (lib/modules.ts), with the same
// house-number and /numer variants as the street page (lib/address-routes.ts).
// An unknown module is a 404. Until the address page becomes the hub of
// modules, /smieci shows the street page as it is, with its canonical,
// /adres/[id].

export async function moduleMetadata(
  id: string,
  slug: string,
  nr: string | null,
  missing = false,
): Promise<Metadata> {
  // As placeMetadata: Next.js's own noindex is the only robots tag.
  if (!findModule(slug)) return { title: NOT_FOUND_TITLE, robots: null };
  return placeMetadata(id, nr, missing);
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
  const module = findModule(slug);
  const data = module && (await module.load(id, nr));
  if (!module || !data) return <PlaceNotFound />;
  return <module.Details data={data} missing={missing} />;
}
