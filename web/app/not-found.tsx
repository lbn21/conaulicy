import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Nie ma takiej strony",
};

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 md:px-8">
      <h1 className="mt-8 text-2xl font-bold tracking-tight md:mt-14 md:text-3xl">
        Nie ma takiej strony
      </h1>
      <p className="mt-4 max-w-prose">
        Może adres ma literówkę albo strona zniknęła. Wpisz ulicę jeszcze raz na
        stronie głównej.
      </p>
      <p className="mt-8">
        <a
          href="/"
          className="inline-flex min-h-12 items-center font-bold underline decoration-2 underline-offset-4"
        >
          Wróć na stronę główną
        </a>
      </p>
    </main>
  );
}
