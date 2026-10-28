import { ModuleMain, moduleMetadata } from "@/components/module-page";
import { houseNumber } from "@/lib/house";

// /adres/[id]/[module]?nr=7/22 lands here (next.config.ts rewrites it), as
// /adres/[id]/nr/… for the street page, any other non-empty ?nr= too.
export const revalidate = 600;

export function generateStaticParams(): Array<{
  id: string;
  module: string;
  nr: string[];
}> {
  return [];
}

export async function generateMetadata({
  params,
}: PageProps<"/adres/[id]/[module]/nr/[...nr]">) {
  const { id, module, nr } = await params;
  const given = nr.join("/");
  return moduleMetadata(id, module, given, houseNumber(given) === null);
}

export default async function ModuleWithNumberPage({
  params,
}: PageProps<"/adres/[id]/[module]/nr/[...nr]">) {
  const { id, module, nr } = await params;
  const given = nr.join("/");
  return (
    <ModuleMain
      id={id}
      slug={module}
      nr={given}
      missing={houseNumber(given) === null}
    />
  );
}
