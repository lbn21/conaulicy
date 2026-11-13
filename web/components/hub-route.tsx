import { HubMain } from "@/components/hub";
import {
  type AddressSearch,
  metadataQuery,
  PlaceUnknown,
  placeMetadata,
  unknownMetadata,
} from "@/components/place-page";
import { PlaceSuspense } from "@/components/place-suspense";

// The address page's two routes, one body (components/hub.tsx): the place
// alone, /adres/[id] (app/adres/[id]/page.tsx), prerendered whole for every
// known place; and the same address with ?nr= or ?imgw=
// (app/adres/[id]/nr/page.tsx), where proxy.ts sends those (lib/address-
// routes.ts queryRoute), read per request behind the skeleton. The first
// never reads searchParams, so nothing in its HTML waits for a request.

type HubParams = Promise<{ id: string }>;
type HubProps = { params: HubParams; searchParams: AddressSearch };

/** The address page's route: `query`, the one that reads ?nr= and ?imgw=. */
export function hubRoute(query: boolean) {
  const search = (props: HubProps) => (query ? props.searchParams : null);
  return {
    generateMetadata: async (props: HubProps) => {
      const { id } = await props.params;
      const found = await metadataQuery(id, search(props));
      if (!found) return unknownMetadata(id);
      return placeMetadata(id, found.nr, found.missing);
    },
    Page: (props: HubProps) => (
      <PlaceSuspense>
        <HubContent params={props.params} searchParams={search(props)} />
      </PlaceSuspense>
    ),
  };
}

async function HubContent({
  params,
  searchParams,
}: {
  params: HubParams;
  searchParams: AddressSearch | null;
}) {
  // A renamed place's old address: proxy.ts answers its 308; a retired
  // one nothing replaced says it is gone.
  const { id } = await params;
  return (
    <HubMain
      id={id}
      searchParams={searchParams}
      unknown={<PlaceUnknown id={id} />}
    />
  );
}
