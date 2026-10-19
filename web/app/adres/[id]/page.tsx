import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { polishDay, todayInWarsaw } from "@/lib/dates";
import { getPlace, listPlaces } from "@/lib/schedule";

export const dynamicParams = false;
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

const TONE: Record<string, string> = {
  zmieszane: "bg-waste-zmieszane",
  popiol: "bg-waste-popiol",
  bio: "bg-waste-bio",
  papier: "bg-waste-papier",
  tworzywa: "bg-waste-plastik-metale",
  tworzywa_metale: "bg-waste-plastik-metale",
  szklo: "bg-waste-szklo",
  wielkogabarytowe: "bg-waste-gabaryty",
  elektro: "bg-waste-gabaryty",
  opony: "bg-waste-gabaryty",
  tekstylia: "bg-waste-gabaryty",
};

function tones(subtype: string): string[] {
  if (subtype === "zmieszane_i_bio") return ["zmieszane", "bio"];
  return [subtype];
}

function hour(time: string): string {
  return time.replace(/^0/, "");
}

export default async function PlacePage({ params }: PageProps<"/adres/[id]">) {
  const { id } = await params;
  const place = getPlace(id);
  if (!place) notFound();

  const today = todayInWarsaw();

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

          {place.days.length === 0 ? (
            <p className="mt-10 max-w-prose">
              Nie mamy jeszcze kolejnych terminów. Dopiszemy je, gdy pojawi się
              nowy harmonogram.
            </p>
          ) : (
            <ol aria-label="Najbliższe odbiory" className="mt-10">
              {place.days.map((day, index) => {
                const label = polishDay(day.date, today);
                const putOutBy = day.pickups.find((p) => p.putOutBy)?.putOutBy;
                const next = index === 0;
                return (
                  <li
                    key={day.date}
                    className={
                      next
                        ? "border-l-4 border-accent py-6 pl-4"
                        : "border-t border-border py-6"
                    }
                  >
                    <h2 className="text-xl font-bold">
                      <time dateTime={day.date}>
                        {label.relative && (
                          <span className="text-accent">
                            {label.relative},{" "}
                          </span>
                        )}
                        {label.text}
                      </time>
                    </h2>
                    {putOutBy && (
                      <p className="mt-2 text-text-muted">
                        Wystaw przed posesję do godziny {hour(putOutBy)}.
                      </p>
                    )}
                    <ul className="mt-4 flex flex-col gap-3">
                      {day.pickups.map((pickup) => (
                        <li key={pickup.id} className="flex items-center gap-3">
                          <span aria-hidden="true" className="flex gap-1">
                            {tones(pickup.subtype).map((tone) => (
                              <span
                                key={tone}
                                className={`size-6 shrink-0 rounded-sm ${TONE[tone] ?? "border-2 border-border bg-secondary"}`}
                              />
                            ))}
                          </span>
                          <span>{pickup.label}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ol>
          )}

          {!place.verified && (
            <div className="mt-2 border-t border-border pt-6 text-text-muted">
              <p className="max-w-prose">
                Te daty przepisaliśmy ręcznie i nikt ich jeszcze nie sprawdził
                drugi raz. Gdyby coś się nie zgadzało, rację ma harmonogram
                gminy.
              </p>
              {place.sources.map((doc) => (
                <p key={doc} className="mt-3 break-all">
                  Źródło: {doc.split("/").at(-1)}
                </p>
              ))}
            </div>
          )}
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
