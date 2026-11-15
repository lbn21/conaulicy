import { GminaOutages, gminaMetadata } from "@/components/gmina-outages";

// The gmina-wide power outages page, /prad (components/gmina-outages.tsx),
// prerendered whole at build, re-rendered when its view changes
// (lib/gmina-pages.ts, lib/page-refresh.ts).

export const metadata = gminaMetadata("prad");

export default function Page() {
  return <GminaOutages slug="prad" />;
}
