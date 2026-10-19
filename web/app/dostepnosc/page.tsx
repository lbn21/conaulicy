import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dostępność",
};

export default function AccessibilityPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 md:px-8">
      <h1 className="mt-8 text-2xl font-bold tracking-tight md:mt-14 md:text-3xl">
        Dostępność
      </h1>
      <p className="mt-4 max-w-prose">
        Chcemy, żeby z tej strony wygodnie korzystał każdy: osoby starsze,
        słabiej widzące, korzystające z czytnika ekranu albo tylko z klawiatury.
        Celujemy w poziom AA wytycznych WCAG 2.2.
      </p>

      <div className="mt-8 flex max-w-prose flex-col gap-6">
        <section>
          <h2 className="text-lg font-bold">Jak budujemy stronę</h2>
          <ul className="mt-2 flex list-disc flex-col gap-2 pl-6">
            <li>
              Duży tekst (co najmniej 18 px) i mocny kontrast, w ciemnym i
              jasnym wyglądzie.
            </li>
            <li>
              Przyciski i linki duże na tyle, żeby trafić w nie palcem (co
              najmniej 48 px).
            </li>
            <li>
              Projektujemy od ekranu telefonu o szerokości 360 px i z myślą o
              powiększeniu tekstu do 200%.
            </li>
            <li>
              Każdy element ma być dostępny z klawiatury, z dobrze widocznym
              zaznaczeniem.
            </li>
            <li>
              Rodzaj odpadów poznasz po nazwie, nie tylko po kolorze. W PDF do
              druku każdy rodzaj ma też swój kształt.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold">Jak to sprawdzamy</h2>
          <p className="mt-2">
            Przy każdej zmianie strony automatycznie uruchamiamy dwa testy:
            walidator HTML (Nu Html Checker, ten sam co na validator.w3.org)
            oraz axe-core, który szuka błędów dostępności według WCAG 2.2 AA.
            Sprawdzamy każdą stronę w ciemnym i jasnym wyglądzie, na ekranie
            telefonu i komputera. Ostatnio:{" "}
            <time dateTime="2026-10-19">19 października 2026</time>, bez błędów.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold">Czego jeszcze nie wiemy</h2>
          <ul className="mt-2 flex list-disc flex-col gap-2 pl-6">
            <li>
              Automatyczne testy wyłapują tylko część problemów. Nie
              sprawdziliśmy jeszcze ręcznie strony z czytnikiem ekranu, samą
              klawiaturą ani przy powiększeniu 200% na prawdziwych urządzeniach.
            </li>
            <li>
              PDF do druku ma oznaczoną strukturę, ale nie przeszedł jeszcze
              osobnego testu dostępności PDF.
            </li>
            <li>
              Wyszukiwarka adresów potrzebuje JavaScriptu. Bez niego działają
              przykładowe adresy na stronie głównej.
            </li>
            <li>
              Oryginalne harmonogramy gminy to często obrazki. Przepisujemy je
              na tekst, ale samych plików źródłowych nie poprawimy.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold">Coś nie działa?</h2>
          <p className="mt-2">
            Napisz, co było trudne i na jakim urządzeniu. Każda taka wiadomość
            pomaga.
          </p>
          <a
            href="mailto:kontakt@conaulicy.pl"
            className="inline-flex min-h-12 items-center font-bold underline decoration-2 underline-offset-4"
          >
            kontakt@conaulicy.pl
          </a>
        </section>

        <p className="text-text-muted">
          Ostatnia zmiana tej strony:{" "}
          <time dateTime="2026-10-19">19 października 2026</time>.
        </p>
      </div>
    </main>
  );
}
