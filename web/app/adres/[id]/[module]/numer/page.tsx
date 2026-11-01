import {
  ModuleMain,
  moduleLive,
  moduleMetadata,
} from "@/components/module-page";
import { PlaceNotFound } from "@/components/place-page";
import { PlaceSuspense } from "@/components/place-suspense";

// /adres/[id]/[module]?nr= with no usable house number lands here (proxy.ts
// rewrites it), as /adres/[id]/numer for the street page.
// A static shell with a live hole, prerendered for every place, as the
// subpage.

export { generateStaticParams } from "../page";

export async function generateMetadata({
  params,
}: PageProps<"/adres/[id]/[module]/numer">) {
  const { id, module } = await params;
  return moduleMetadata(id, module, null, true);
}

export default function ModuleMissingNumberPage({
  params,
}: PageProps<"/adres/[id]/[module]/numer">) {
  return (
    <PlaceSuspense shape="subpage">
      <ModuleMissingNumberPageContent params={params} />
    </PlaceSuspense>
  );
}

async function ModuleMissingNumberPageContent({
  params,
}: Pick<PageProps<"/adres/[id]/[module]/numer">, "params">) {
  const { id, module } = await params;
  return (
    <ModuleMain
      id={id}
      slug={module}
      nr={null}
      missing
      unknown={<PlaceNotFound />}
      live={moduleLive(id, module, null)}
    />
  );
}
