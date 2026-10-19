import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Prywatność",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 md:px-8">
      <h1 className="mt-8 text-2xl font-bold tracking-tight md:mt-14 md:text-3xl">
        Prywatność
      </h1>
      <p className="mt-4 max-w-prose">
        Krótko: nic o Tobie nie zbieramy. Strona ma tylko powiedzieć, kiedy
        wystawić śmieci.
      </p>

      <div className="mt-8 flex max-w-prose flex-col gap-6">
        <section>
          <h2 className="text-lg font-bold">Bez ciasteczek i bez kont</h2>
          <p className="mt-2">
            Nie używamy ciasteczek, nie ma logowania ani zakładania konta. Nie
            ma też reklam, statystyk ani czcionek ściąganych z innych serwisów.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold">
            Jedna rzecz w Twojej przeglądarce
          </h2>
          <p className="mt-2">
            Zapamiętujemy tylko, czy wolisz wygląd ciemny, jasny czy systemowy.
            Ta informacja leży w pamięci przeglądarki (localStorage) na Twoim
            urządzeniu i nie trafia do nas.
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
    </main>
  );
}
