import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/page-head";
import { indexable } from "@/lib/indexing";

// A place TERYT no longer lists and no reviewed rename replaced
// (lib/dataset-views.ts retiredPlaceOf): its address stays, printed on a
// PDF or in a bookmark, and says so instead of a 404, with the way back to
// the search, as „Zmień adres” (components/place-page.tsx AddressPage).
// One renamed answers 308 instead (proxy.ts).

export type GonePlace = { name: string; kind: "ulica" | "wies" };

function goneTitle({ kind }: GonePlace): string {
  return kind === "ulica"
    ? "Tej ulicy nie ma już w rejestrze adresów"
    : "Tej miejscowości nie ma już w rejestrze adresów";
}

/** Its metadata: its title, never a search result. */
export function goneMetadata(place: GonePlace): Metadata {
  return {
    title: goneTitle(place),
    description: null,
    robots: { index: false, follow: indexable() },
  };
}

export function PlaceGone({ place }: { place: GonePlace }) {
  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <PageHead
          caption={place.name}
          title={goneTitle(place)}
          lead={`Mogła zmienić nazwę. Nazwy ${place.kind === "ulica" ? "ulic" : "miejscowości"} bierzemy z rejestru TERYT, a tej już w nim nie ma. Wyszukaj swój adres jeszcze raz.`}
        />
        <p className="govuk-body">
          <Link href="/" className="govuk-link">
            Wyszukaj adres
          </Link>
        </p>
      </div>
    </div>
  );
}
