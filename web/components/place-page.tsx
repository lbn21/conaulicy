import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PickupSchedule } from "@/components/pickup-schedule";
import { longDate } from "@/lib/date-labels";
import { withHouseNumber } from "@/lib/house";
import { scheduleName } from "@/lib/places";
import { getPlace, type PlaceView } from "@/lib/schedule";
import { SEARCH_ID } from "@/lib/search";

// The street or village page, for /adres/[id] and, with a house number,
// /adres/[id]?nr=… (rewritten in next.config.ts to /adres/[id]/nr/…, so it
// stays a cached page). Canonical is always /adres/[id].

export async function placeMetadata(
  id: string,
  nr: string | null,
): Promise<Metadata> {
  const place = await getPlace(id, nr);
  return {
    title: place ? withHouseNumber(place.label, place.nr) : "Adres",
    alternates: { canonical: `/adres/${encodeURIComponent(id)}` },
  };
}

/**
 * A street split by house numbers: ask for the number, like a GOV.UK
 * question page. A plain GET form, so it works without JS.
 */
function HouseNumberQuestion({ place }: { place: PlaceView }) {
  return (
    <form
      method="get"
      action={`/adres/${encodeURIComponent(place.id)}`}
      className="mt-8 flex flex-col gap-2"
    >
      <label htmlFor="nr" className="text-lg font-bold">
        Jaki jest numer domu?
      </label>
      <p id="nr-hint" className="max-w-prose text-text-muted">
        Na tej ulicy śmieciarka przyjeżdża w różne dni, zależnie od numeru. Na
        przykład 12, 12a albo 7/22.
      </p>
      {place.unknownNr && (
        <p id="nr-note" className="max-w-prose font-bold">
          Numeru {place.unknownNr} nie ma w harmonogramie tej ulicy. Sprawdź
          numer albo harmonogram gminy.
        </p>
      )}
      <input
        id="nr"
        name="nr"
        type="text"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="go"
        maxLength={12}
        aria-describedby={place.unknownNr ? "nr-hint nr-note" : "nr-hint"}
        className="mt-1 min-h-14 w-32 rounded-sm border-2 border-border bg-surface px-4 text-lg text-text focus-visible:border-focus"
      />
      <p className="mt-2">
        <button
          type="submit"
          className="inline-flex min-h-14 items-center rounded-sm bg-accent px-5 text-lg font-bold text-accent-contrast"
        >
          Pokaż odbiory
        </button>
      </p>
    </form>
  );
}

export async function PlaceMain({ id, nr }: { id: string; nr: string | null }) {
  const place = await getPlace(id, nr);
  if (!place) notFound();
  const name = withHouseNumber(place.name, place.nr);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 md:px-8">
      <p className="mt-8 text-text-muted md:mt-14">{place.area}</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">
        {name}
      </h1>
      {/* Like GOV.UK's "Change": back to an empty, focused search. */}
      <p className="mt-2">
        <a
          href={`/#${SEARCH_ID}`}
          className="inline-flex min-h-12 items-center underline decoration-2 underline-offset-4"
        >
          Zmień adres<span className="sr-only"> {name}</span>
        </a>
      </p>

      {place.askNumber ? (
        <HouseNumberQuestion place={place} />
      ) : place.zoneId === null ? (
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
                className="inline-flex min-h-12 items-center font-bold underline decoration-2 underline-offset-4"
              >
                {`Otwórz ${scheduleName(place.gmina)}`}
              </a>
            </p>
          )}
        </section>
      ) : (
        <>
          <a
            href={`/ics/${encodeURIComponent(place.zoneId)}`}
            data-event="calendar_add"
            data-zone={place.zoneId}
            data-source="street"
            className="mt-6 inline-flex min-h-14 items-center rounded-sm bg-accent px-5 text-lg font-bold text-accent-contrast no-underline"
          >
            Dodaj do kalendarza
          </a>
          <p className="mt-3 max-w-prose text-text-muted">
            Plik z datami. Telefon zapyta, czy wpisać je do kalendarza.
          </p>
          <p className="mt-2">
            <a
              href={`/adres/${encodeURIComponent(place.id)}/harmonogram.pdf${place.nr ? `?nr=${place.nr}` : ""}`}
              data-event="pdf_open"
              data-zone={place.zoneId}
              className="inline-flex min-h-12 items-center font-bold underline decoration-2 underline-offset-4"
            >
              Harmonogram do druku (PDF)
            </a>
          </p>

          <PickupSchedule days={place.days} renderedOn={place.today} />

          <div className="mt-2 border-t border-border pt-6 text-text-muted">
            {!place.verified && (
              <p className="mb-3 max-w-prose">
                Te daty odczytaliśmy automatycznie z harmonogramu gminy i nikt
                ich jeszcze nie sprawdził drugi raz. Gdyby coś się nie zgadzało,
                rację ma harmonogram gminy.
              </p>
            )}
            {place.sources.map((source) => (
              <p key={source.label} className="max-w-prose">
                Źródło:{" "}
                {source.url ? (
                  <a
                    href={source.url}
                    className="underline decoration-2 underline-offset-4"
                  >
                    {scheduleName(place.gmina)}
                  </a>
                ) : (
                  scheduleName(place.gmina)
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
    </main>
  );
}
