import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Prywatność",
};

export default function PrivacyPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="mt-8 text-2xl font-bold tracking-tight md:mt-14 md:text-3xl">
        Prywatność
      </h1>
      <p className="mt-4 max-w-prose">
        Krótko: nie wiemy, kim jesteś, i nie chcemy wiedzieć. Strona ma tylko
        powiedzieć, kiedy wystawić śmieci.
      </p>

      <div className="mt-8 flex max-w-prose flex-col gap-6">
        <section>
          <h2 className="text-lg font-bold">Bez ciasteczek i bez kont</h2>
          <p className="mt-2">
            Nie używamy ciasteczek, nie ma logowania ani zakładania konta. Nie
            ma też reklam ani czcionek ściąganych z innych serwisów.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold">Nic w Twojej przeglądarce</h2>
          <p className="mt-2">
            Nie zapisujemy niczego w pamięci Twojej przeglądarki. Strona tylko
            pobiera listę ulic, żeby szybciej podpowiadać adresy.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold">Anonimowe statystyki</h2>
          <p className="mt-2">
            Liczymy odwiedziny, żeby wiedzieć, czy strona się przydaje: ile osób
            ją otwiera, które strony i jak często ktoś dodaje odbiory do
            kalendarza albo otwiera PDF. Robi to Vercel Web Analytics, bez
            ciasteczek. Adres IP nie jest zapisywany, a skrót, który odróżnia
            jedną wizytę od drugiej, znika po 24 godzinach. Widzimy tylko
            zbiorcze liczby, nigdy pojedynczą osobę. Wpisanego adresu ani numeru
            domu do statystyk nie wysyłamy.
          </p>
          <p className="mt-2">
            <a
              href="https://vercel.com/docs/analytics/privacy-policy"
              className="inline-flex min-h-12 items-center underline decoration-2 underline-offset-4"
            >
              Jak Vercel chroni te dane (po angielsku)
            </a>
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold">Logi serwera</h2>
          <p className="mt-2">
            Stronę udostępnia firma hostingowa. Jak każdy serwer, zapisuje ona
            techniczne logi: adres IP, godzinę i otwierany adres strony, w tym
            to, co wpiszesz w wyszukiwarkę. Hosting zapisuje je w naszym
            imieniu.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold">Kalendarz</h2>
          <p className="mt-2">
            Przycisk „Dodaj do kalendarza” pobiera zwykły plik z datami. Co z
            nim zrobisz, zostaje między Tobą a Twoim telefonem.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold">Kto prowadzi stronę</h2>
          <p className="mt-2">
            Stronę prowadzi prywatnie Jakub Marciniszyn. Jest administratorem
            danych z logów serwera. Pytania o prywatność albo o stronę wyślij na
            adres:
          </p>
          <a
            href="mailto:kontakt@conaulicy.pl"
            className="inline-flex min-h-12 items-center font-bold underline decoration-2 underline-offset-4"
          >
            kontakt@conaulicy.pl
          </a>
        </section>
      </div>
    </div>
  );
}
