import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PickupSchedule } from "@/components/pickup-schedule";
import { longDate } from "@/lib/dates";
import { getPlace, listPlaces } from "@/lib/schedule";

export const dynamicParams = false;
// Regenerate hourly so the static HTML never lists pickups that are already past.
export const revalidate = 3600;

export function generateStaticParams() {
  return listPlaces().map(({ id }) => ({ id }));
}

export async function generateMetadata({
  params,
}: PageProps<"/adres/[id]">): Promise<Metadata> {
  const { id } = await params;
  const place = getPlace(id);
  return { title: place ? place.label : "Adres" };
}

export default async function PlacePage({ params }: PageProps<"/adres/[id]">) {
  const { id } = await params;
  const place = getPlace(id);
  if (!place) notFound();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 md:px-8">
      <p className="mt-8 text-text-muted md:mt-14">{place.area}</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">
        {place.name}
      </h1>

      {place.zoneId === null ? (
        <section
          aria-labelledby="empty-heading"
          className="mt-8 border-l-4 border-accent pl-4"
        >
          <h2 id="empty-heading" className="text-lg font-bold">
            {place.kind === "ulica"
              ? "Tej ulicy jeszcze nie mamy"
              : "Tej wsi jeszcze nie mamy"}
          </h2>
          <p className="mt-3 max-w-prose">
            Harmonogramu tu nie zgadujemy. Do tego czasu sprawdź odbiory w
            harmonogramie gminy.
          </p>
          {place.schedulePage && (
            <p className="mt-3">
              <a
                href={place.schedulePage}
                rel="noopener"
                className="inline-flex min-h-12 items-center font-bold underline decoration-2 underline-offset-4"
              >
                Otwórz harmonogram gminy
              </a>
            </p>
          )}
        </section>
      ) : (
        <>
          <a
            href={`/ics/${encodeURIComponent(place.zoneId)}`}
            className="mt-8 inline-flex min-h-14 items-center rounded-sm bg-accent px-5 text-lg font-bold text-accent-contrast no-underline"
          >
            Dodaj do kalendarza
          </a>
          <p className="mt-3 max-w-prose text-text-muted">
            Plik z datami. Telefon zapyta, czy wpisać je do kalendarza.
          </p>

          <PickupSchedule days={place.days} />

          <div className="mt-2 border-t border-border pt-6 text-text-muted">
            {!place.verified && (
              <p className="mb-3 max-w-prose">
                Te daty przepisaliśmy ręcznie i nikt ich jeszcze nie sprawdził
                drugi raz. Gdyby coś się nie zgadzało, rację ma harmonogram
                gminy.
              </p>
            )}
            {place.sources.map((source) => (
              <p key={source.label} className="max-w-prose">
                Źródło:{" "}
                {source.url ? (
                  <a
                    href={source.url}
                    rel="noopener"
                    className="underline decoration-2 underline-offset-4"
                  >
                    harmonogram gminy
                  </a>
                ) : (
                  "harmonogram gminy"
                )}
                , {source.label}
                {source.checkedAt && (
                  <>. Stan na {longDate(source.checkedAt)}.</>
                )}
              </p>
            ))}
          </div>
        </>
      )}

      <p className="mt-12">
        <a
          href="/"
          className="inline-flex min-h-12 items-center underline decoration-2 underline-offset-4"
        >
          Sprawdź inny adres
        </a>
      </p>
    </main>
  );
}
