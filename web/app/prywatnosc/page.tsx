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

// Our processors' own pages: Vercel (hosting, logs, analytics; transfers
// under the DPF and the DPA's standard contractual clauses) and ImprovMX
// (forwards mail sent to our address).
const VERCEL_PRIVACY = "https://vercel.com/legal/privacy-policy";
const VERCEL_DPA = "https://vercel.com/legal/dpa";
const IMPROVMX_PRIVACY = "https://improvmx.com/privacy/";

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
                osób ją otwiera, które strony i jak często ktoś dodaje do
                kalendarza odbiory lub przerwy w dostawie wody albo otwiera PDF.
                Robi to Vercel Web Analytics, bez ciasteczek. Adres IP nie jest
                zapisywany, a skrót, który odróżnia jedną wizytę od drugiej,
                znika po 24 godzinach. Widzimy tylko zbiorcze liczby, nigdy
                pojedynczą osobę. Widzimy, które ulice są oglądane, ale nie to,
                co wpisujesz, ani numeru domu.
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

            <section>
              <h2 className="govuk-heading-m">Twoje prawa i szczegóły</h2>
              <p className="govuk-body">
                Logi serwera i statystyki prowadzimy w naszym prawnie
                uzasadnionym interesie (art. 6 ust. 1 lit. f RODO): żeby strona
                działała, była bezpieczna i żebyśmy wiedzieli, które strony się
                przydają.
              </p>
              <p className="govuk-body">
                Stronę udostępnia, zapisuje logi i liczy statystyki firma Vercel
                Inc. z USA. Vercel przystąpił do programu EU-US Data Privacy
                Framework, a dane z Europy przekazuje na podstawie standardowych
                klauzul umownych. Wiadomości wysłane na nasz adres przekazuje
                dalej firma ImprovMX.
              </p>
              <ul className="govuk-list">
                <li>
                  <a href={VERCEL_PRIVACY} className="govuk-link">
                    Polityka prywatności Vercel (po angielsku)
                  </a>
                </li>
                <li>
                  <a href={VERCEL_DPA} className="govuk-link">
                    Umowa powierzenia danych Vercel (po angielsku)
                  </a>
                </li>
                <li>
                  <a href={IMPROVMX_PRIVACY} className="govuk-link">
                    Polityka prywatności ImprovMX (po angielsku)
                  </a>
                </li>
              </ul>
              <p className="govuk-body">
                Logi serwera Vercel przechowuje przez 1 dzień. Zbiorcze
                statystyki są dostępne przez 12 miesięcy, a Vercel może je
                trzymać dłużej.
              </p>
              <p className="govuk-body">
                Masz prawo do dostępu do swoich danych, ich sprostowania,
                usunięcia i ograniczenia przetwarzania, a także prawo sprzeciwu.
                Wystarczy do nas napisać. Możesz też złożyć skargę do{" "}
                <a href="https://uodo.gov.pl/" className="govuk-link">
                  Prezesa Urzędu Ochrony Danych Osobowych
                </a>
                .
              </p>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
