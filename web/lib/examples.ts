// The home page's „Przykładowe adresy”: chosen by hand, in this order. Three
// central Lubaczów streets in different sectors and one village of the gmina,
// Lisie Jamy, the village of the search hint (lib/search-hint.ts), by their
// TERYT ids, which the CI fixture (scripts/ci-fixture.ts) uses too. Labels are
// the places' own names from the data. scripts/check-examples.mjs fails if
// one is missing or has no upcoming pickups.
export const HOME_EXAMPLES = [
  "0972447-19253", // ul. Rynek
  "0972447-12740", // ul. Adama Mickiewicza
  "0972447-16264", // ul. Józefa Piłsudskiego
  "0606234", // Lisie Jamy
];
