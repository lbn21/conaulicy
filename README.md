# conaulicy.pl

[![Stan CI na gałęzi main](https://github.com/lbn21/conaulicy/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/lbn21/conaulicy/actions/workflows/ci.yml?query=branch%3Amain)
[![Licencja: AGPL-3.0-or-later](https://img.shields.io/badge/licencja-AGPL--3.0--or--later-blue)](LICENSE)

Darmowa strona dla mieszkańców Lubaczowa: miasta i gminy. Wpisujesz swoją ulicę albo miejscowość i od razu widzisz, kiedy przyjadą po śmieci. Terminy możesz dodać do swojego kalendarza (ICS) albo pobrać jako PDF i powiesić na lodówce.

Strona jest niekomercyjna i nie trzeba na niej zakładać konta.

Działa tutaj: https://conaulicy.pl

## Coś się nie zgadza?

Napisz do nas: kontakt@conaulicy.pl. Zgłoszenia przyjmujemy tylko mailem, nie przez GitHub Issues.

## Z czego jest zbudowana

- Next.js 16 (App Router), React 19 i TypeScript, Node 24.
- Wygląd i komponenty z GOV.UK Frontend oraz wyszukiwarka z accessible-autocomplete, z własnym logo, kolorami i krojem pisma.
- Baza Postgres (Neon) i Drizzle ORM.
- Kalendarz ICS i harmonogram PDF (PDFKit) generowane na serwerze.
- Biome do lintowania i formatowania.
- Hosting na Vercel.

Zasady projektu: [CLAUDE.md](CLAUDE.md). Więcej o samej aplikacji: [web/README.md](web/README.md).

## Uruchomienie lokalnie

Potrzebujesz Node 24 i własnej, lokalnej bazy Postgres (np. z Dockera). Nigdy nie podłączaj się do bazy produkcyjnej.

```sh
cd web
npm ci
cp .env.example .env.local   # wpisz adres swojej lokalnej bazy w DATABASE_URL i DATABASE_URL_UNPOOLED
npm run db:migrate           # tworzy tabele
npm run db:ci-fixture        # wgrywa zmyślone dane testowe (działa tylko na lokalnej bazie)
npm run dev
```

Lista zmiennych środowiskowych z krótkim opisem jest w [web/.env.example](web/.env.example). Więcej o bazie i testowaniu zmian w danych: [docs/database.md](docs/database.md#testing-data-changes-without-touching-production). Import harmonogramów: [docs/import.md](docs/import.md).

## Licencja

Kod jest dostępny na licencji GNU Affero General Public License w wersji 3 lub dowolnej późniejszej (AGPL-3.0-or-later), pełny tekst w pliku [LICENSE](LICENSE).

Części pochodzące od innych zachowują swoje własne warunki:

- harmonogramy i inne dane gminy oraz pobrane pliki źródłowe należą do ich wydawców;
- krój pisma Atkinson Hyperlegible Next: SIL Open Font License 1.1 (OFL);
- GOV.UK Frontend: licencja MIT;
- nazwy miejscowości i ulic z rejestru TERYT: Główny Urząd Statystyczny (GUS).

Szczegóły i pełne teksty licencji: [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
