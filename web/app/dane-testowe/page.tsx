import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dane testowe",
};

// The source page linked from every test-data event (source.url).
export default function TestDataPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="mt-8 text-2xl font-bold tracking-tight md:mt-14 md:text-3xl">
        Dane testowe
      </h1>
      <div className="mt-4 flex max-w-prose flex-col gap-4">
        <p>
          Strona jest w przygotowaniu. Ulice, sektory i terminy, które teraz
          widzisz, wymyśliliśmy do sprawdzania strony, kalendarza i PDF. Nie
          wystawiaj według nich pojemników.
        </p>
        <p>
          Prawdziwe terminy znajdziesz w harmonogramach:{" "}
          <a
            href="https://czystylubaczow.info/odbior-odpadow/harmonogram-odbioru-odpadow/"
            rel="noopener"
            className="underline decoration-2 underline-offset-4"
          >
            miasta Lubaczów
          </a>{" "}
          i{" "}
          <a
            href="https://www.gminalubaczow.pl/2026/01/02/harmonogram-odbioru-odpadow-komunalnych-na-rok-2026/"
            rel="noopener"
            className="underline decoration-2 underline-offset-4"
          >
            gminy Lubaczów
          </a>
          .
        </p>
        <p>
          Kiedy wgramy prawdziwe harmonogramy, ten napis zniknie, a przy każdym
          terminie zobaczysz link do dokumentu gminy i datę, kiedy go
          sprawdziliśmy.
        </p>
      </div>
    </div>
  );
}
