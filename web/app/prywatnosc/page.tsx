import type { Metadata } from "next";
import { ContactLink } from "@/components/contact-link";
import { ImgwBanner } from "@/components/imgw-banner";
import { pageMetadata } from "@/lib/share";
import { PRIVACY } from "@/lib/static-pages";

export const metadata: Metadata = pageMetadata({
  path: PRIVACY.path,
  title: PRIVACY.text,
  description:
    "Bez ciasteczek, kont i reklam. Nie wiemy, kim jesteś, i nie chcemy wiedzieć. Krótko o tym, co liczymy i co zapisuje serwer.",
});

export default function PrivacyPage() {
  return (
    <>
      <ImgwBanner />
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <h1 className="govuk-heading-l">{PRIVACY.text}</h1>
          <p className="govuk-body-l">
            Krótko: nie wiemy, kim jesteś, i nie chcemy wiedzieć.
          </p>

          <div>
            <section>
              <h2 className="govuk-heading-m">Bez ciasteczek i bez kont</h2>
              <p className="govuk-body">
                Nie używamy ciasteczek, nie ma logowania ani zakładania konta.
                Nie ma też reklam ani czcionek ściąganych z innych serwisów.
              </p>
            </section>

            <section>
              <h2 className="govuk-heading-m">Nic w Twojej przeglądarce</h2>
              <p className="govuk-body">
                Nie zapisujemy niczego w pamięci Twojej przeglądarki. Strona
                tylko pobiera listę ulic, żeby szybciej podpowiadać adresy.
              </p>
              <p className="govuk-body">
                Ostrzeżenia pogodowe pobiera z IMGW nasz serwer. Twoja
                przeglądarka nie łączy się z IMGW.
              </p>
            </section>

            <section>
              <h2 className="govuk-heading-m">Anonimowe statystyki</h2>
              <p className="govuk-body">
                Liczymy odwiedziny, żeby wiedzieć, czy strona się przydaje: ile
                osób ją otwiera, które strony i jak często ktoś dodaje odbiory
                albo przerwy w dostawie wody do kalendarza albo otwiera PDF.
                Robi to Vercel Web Analytics, bez ciasteczek. Adres IP nie jest
                zapisywany, a skrót, który odróżnia jedną wizytę od drugiej,
                znika po 24 godzinach. Widzimy tylko zbiorcze liczby, nigdy
                pojedynczą osobę. Wpisanego adresu ani numeru domu do statystyk
                nie wysyłamy.
              </p>
              <p className="govuk-body">
                <a
                  href="https://vercel.com/docs/analytics/privacy-policy"
                  className="govuk-link"
                >
                  Jak Vercel chroni te dane (po angielsku)
                </a>
              </p>
            </section>

            <section>
              <h2 className="govuk-heading-m">Logi serwera</h2>
              <p className="govuk-body">
                Stronę udostępnia firma hostingowa. Jak każdy serwer, zapisuje
                ona techniczne logi: adres IP, godzinę i otwierany adres strony,
                w tym to, co wpiszesz w wyszukiwarkę. Hosting zapisuje je w
                naszym imieniu.
              </p>
            </section>

            <section>
              <h2 className="govuk-heading-m">Kalendarz</h2>
              <p className="govuk-body">
                Przycisk „Dodaj do kalendarza” pobiera zwykły plik z datami. Co
                z nim zrobisz, zostaje między Tobą a Twoim telefonem.
              </p>
            </section>

            <section>
              <h2 className="govuk-heading-m">Kto prowadzi stronę</h2>
              <p className="govuk-body">
                Stronę prowadzi prywatnie Jakub Marciniszyn. Jest
                administratorem danych z logów serwera. Pytania o prywatność
                albo o stronę wyślij na adres:
              </p>
              <p className="govuk-body">
                <ContactLink />
              </p>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
