// The gazetteer of Lubaczów (lib/districts.ts), as Jakub approved it on
// 26 Oct 2026 (task 151) from his research (a file not in git): every name with
// its streets of confidence high or medium, low ones left out; names with
// no approved street are kept with none (linked as written). Załuże and
// Bałaje are villages of their own, never a town district. Written to the
// database by `npm run db:districts` (scripts/districts-seed.ts); the
// tests read it here. Each street id is checked against the TERYT snapshot
// (checkDistricts). Adding a district is a new entry here.

import type { Confidence, District, DistrictStreet } from "./districts.ts";

const TOWN = "0972447";

const MZGKIM = "https://mzgkim.lubaczow.pl";
const PARISH_STANISLAW_2025 =
  "https://konkatedra.zamojskolubaczowska.pl/2025/01/11/odwiedziny-duszpasterskie-w-parafii-sw-stanislawa-bm/";
const PARISH_STANISLAW_2026 =
  "https://konkatedra.zamojskolubaczowska.pl/2026/01/06/plan-koledy-w-parafii-sw-stanislawa-bm-a-d-2025-2026/";
const PARISH_KAROL =
  "https://zlubaczowa.pl/news/wydarzenia/14524-plan-koledy-w-parafii-pw-sw-karola-boromeusza-w-lubaczowie-harmonogram";
const TOWN_ROADS =
  "https://um.lubaczow.pl/aktualnosci/drogi-miejskie-do-przebudowy.html";
const TOWN_LIGHTING =
  "https://um.lubaczow.pl/aktualnosci/rusza-modernizacja-oswietlenia-w-lubaczowie.html";
const LIGHTING_TENDER =
  "https://przetargi.favore.pl/zamowienia/naprawy-i-instalacje,1012/budowa-i-przebudowa-oswietlenia-ulicznego-w-lubaczowie,2989036.html";
const PLOTS_FOR_SALE =
  "https://elubaczow.com/2025/04/04/atrakcyjne-dzialki-budowlane-w-lubaczowie-na-sprzedaz/";
const PRNG =
  "http://tools.wikimedia.pl/~malarz_pl/cgi-bin/polska.pl?teryt=1809011";

/** Streets of the town by SYM_UL, all of one confidence and source. */
const streets = (
  confidence: Confidence,
  sourceUrl: string | null,
  ...ulic: string[]
): DistrictStreet[] =>
  ulic.map((u) => ({
    id: `${TOWN}-${u}`,
    confidence,
    part: null,
    sourceUrl,
  }));

const district = (
  d: Omit<District, "localityId" | "simc" | "streets"> &
    Partial<Pick<District, "simc" | "streets">>,
): District => ({ localityId: TOWN, simc: null, streets: [], ...d });

export const DISTRICTS: District[] = [
  // TERYT's part Mazury (0972453) has no address and its point lies south
  // of the estate: the estate is these 22 streets, never ul. Mazury
  // (12559), Boczna Mazury (01533), Podleśna, Łąkowa or Ustronna.
  district({
    id: "mazury",
    simc: "0972453",
    name: "Osiedle Mazury",
    variants: [
      "os. Mazury",
      "osiedla Mazury",
      "osiedlu Mazury",
      "osiedle „Mazury”",
      "osiedla „Mazury”",
      "osiedle Mazury (całość)",
    ],
    confidence: "high",
    sourceUrl: `${MZGKIM}/przerwa-w-dostawie-wody-76/`,
    streets: [
      // "na osiedlu Mazury przy ulicach: Leszka Białego, …" (MZGKiM 2023).
      ...streets(
        "high",
        null,
        "38139",
        "29695",
        "08179",
        "22684",
        "38140",
        "15092",
        "38137",
        "38138",
      ),
      // Listed under "Osiedle Mazury" in the parish's visits only.
      ...streets(
        "medium",
        PARISH_STANISLAW_2025,
        "48939",
        "44269",
        "48377",
        "24870",
        "17390",
        "38687",
        "48412",
        "38689",
        "38690",
        "24170",
        "07290",
        "08574",
        "00157",
        "02276",
      ),
    ],
  }),
  // "na os. Mazury VI: ul. Mazurkiewicza, ul. Herzoga" (the town's site).
  district({
    id: "mazury-vi",
    name: "Osiedle Mazury VI",
    variants: ["os. Mazury VI", "osiedlu Mazury VI"],
    confidence: "high",
    sourceUrl: TOWN_ROADS,
    // Named there explicitly, so high here (medium in Osiedle Mazury).
    streets: streets("high", TOWN_ROADS, "38687", "48412"),
  }),
  // "ul. Piaski" is street 16027 only; a bare "Piaski" that street, in doubt.
  district({
    id: "piaski",
    simc: "0972482",
    name: "Osiedle Piaski",
    variants: ["os. Piaski", "osiedla Piaski"],
    confidence: "medium",
    sourceUrl: `${MZGKIM}/przerwa-w-dostawie-wody-74/`,
    streets: [
      ...streets("high", `${MZGKIM}/przerwa-w-dostawie-wody-24/`, "16027"),
      ...streets(
        "medium",
        PARISH_KAROL,
        "16033",
        "18819",
        "24550",
        "26081",
        "14834",
      ),
    ],
  }),
  // One-street estates: the name is that street.
  district({
    id: "maly-lazek",
    name: "Osiedle Mały Łążek",
    variants: [
      "osiedle „Mały Łążek”",
      "osiedle Mały Łążek (całość)",
      "osiedla Mały Łążek",
    ],
    confidence: "high",
    sourceUrl: `${MZGKIM}/przerwa-w-dostawie-wody-83/`,
    streets: streets("high", null, "12206"),
  }),
  district({
    id: "jagiellonow",
    name: "Osiedle Jagiellonów",
    variants: ["os. Jagiellonów"],
    confidence: "high",
    sourceUrl: `${MZGKIM}/195/`,
    streets: streets("high", null, "45843"),
  }),
  // Never ul. Adama Mickiewicza (12740).
  district({
    id: "mickiewicza",
    name: "Osiedle Mickiewicza",
    variants: [
      "os. Mickiewicza",
      "osiedlu Mickiewicza",
      "Osiedle Adama Mickiewicza",
    ],
    confidence: "high",
    sourceUrl: `${MZGKIM}/195/`,
    streets: streets("high", null, "48372"),
  }),
  // TERYT has the estate (48373) apart from the street its addresses carry.
  district({
    id: "unii-lubelskiej",
    name: "Osiedle Unii Lubelskiej",
    variants: ["os. Unii Lubelskiej", "osiedla Unii Lubelskiej"],
    confidence: "high",
    sourceUrl: `${MZGKIM}/195/`,
    streets: [
      ...streets("high", null, "48373"),
      ...streets("medium", null, "23367"),
    ],
  }),
  district({
    id: "orzeszkowej",
    name: "Osiedle Orzeszkowej",
    variants: ["os. Orzeszkowej", "osiedla Orzeszkowej", "osiedlu Orzeszkowej"],
    confidence: "medium",
    sourceUrl: `${MZGKIM}/informacja-o-przerwach-w-dostawie-wody-3/`,
    streets: streets("medium", null, "15211"),
  }),
  district({
    id: "norwida",
    name: "Osiedle Norwida",
    variants: ["os. Norwida", "osiedlu Norwida"],
    confidence: "medium",
    sourceUrl: `${MZGKIM}/przerwa-w-dostawie-wody-29/`,
    streets: streets("medium", null, "14319"),
  }),
  // The blocks only, not the whole street.
  district({
    id: "slowackiego",
    name: "Osiedle Słowackiego",
    variants: [
      "os. Słowackiego",
      "osiedla Słowackiego",
      "bloki przy ul. Słowackiego",
    ],
    confidence: "medium",
    sourceUrl: PARISH_STANISLAW_2026,
    streets: [
      {
        id: `${TOWN}-20291`,
        confidence: "medium",
        part: "bloki 24–34A",
        sourceUrl: null,
      },
    ],
  }),
  district({
    id: "zelichowka",
    name: "Osiedle Żelichówka",
    variants: ["osiedlu Żelichówka"],
    confidence: "high",
    sourceUrl: `${MZGKIM}/przerwa-w-dostawie-wody-53/`,
    streets: streets("high", null, "26445"),
  }),
  district({
    id: "pod-borem",
    name: "Osiedle Pod Borem",
    variants: ["Os. Pod Borem"],
    confidence: "medium",
    sourceUrl: `${MZGKIM}/przerwa-w-dostawie-wody/`,
    streets: streets("medium", null, "16590"),
  }),
  // PRNG's name for the town's side of Żuki (a part of Opaka is Żuki too).
  district({
    id: "zuki",
    name: "Żuki Lubaczowskie",
    variants: [],
    confidence: "medium",
    sourceUrl: PARISH_STANISLAW_2026,
    streets: streets("high", null, "26555"),
  }),
  // Names with no approved street: linked as written.
  district({
    id: "niwki",
    simc: "0972460",
    name: "Niwki",
    variants: ["Niwkach"],
    confidence: "high",
    sourceUrl: PRNG,
  }),
  district({
    id: "ostrowiec",
    simc: "0972476",
    name: "Ostrowiec",
    variants: [],
    confidence: "medium",
    sourceUrl: `${MZGKIM}/przerwa-w-dostawie-wody-22/`,
  }),
  district({
    id: "zaprzekop",
    simc: "0972499",
    name: "Zaprzekop",
    variants: ["os. Zaprzekop"],
    confidence: "medium",
    sourceUrl: `${MZGKIM}/przerwa-w-dostawie-wody-6/`,
  }),
  district({
    id: "jana-pawla-ii",
    name: "Osiedle Jana Pawła II",
    variants: ["os. Jana Pawła II"],
    confidence: "medium",
    sourceUrl: `${MZGKIM}/przerwa-w-dostawie-wody-26/`,
  }),
  district({
    id: "folwarki",
    name: "Osiedle Folwarki",
    variants: ["os. Folwarki", "osiedla Folwarki"],
    confidence: "medium",
    sourceUrl: `${MZGKIM}/przerwa-w-dostawie-wody-79/`,
  }),
  district({
    id: "przy-przemyslowej",
    name: "Osiedle przy ul. Przemysłowej",
    variants: [],
    confidence: "medium",
    sourceUrl: `${MZGKIM}/przerwa-w-dostawie-wody-74/`,
  }),
  district({
    id: "za-koleja",
    name: "Osiedle za Koleją",
    variants: ["osiedla za Koleją"],
    confidence: "medium",
    sourceUrl: `${MZGKIM}/informacja-o-przerwach-w-dostawie-wody-3/`,
  }),
  // "Niemirowska wraz z osiedlem": post 4799 (8 Jul 2025).
  district({
    id: "za-niemirowska",
    name: "Osiedle domów jednorodzinnych na zapleczu ul. Niemirowskiej",
    variants: [
      "osiedle na zapleczu ul. Niemirowskiej",
      "Niemirowska wraz z osiedlem",
      "ul. Niemirowska (wraz z przyległymi ulicami)",
      "Niemirowska z ulicami przyległymi",
      "osiedle Niemirowska II",
    ],
    confidence: "medium",
    sourceUrl: `${MZGKIM}/przerwa-w-dostawie-wody-100/`,
    // Never ul. Niemirowska (14183) or Starzyny: post 100 lists them apart.
    streets: [
      // "na os. Niemirowska - ulica Kwiatowa / Konwaliowa / Zielna".
      ...streets("high", TOWN_LIGHTING, "10562", "09223", "26077"),
      // "os. Niemirowska II: ul. Tulipanowa, ul. Różana, ul. Fiołkowa".
      ...streets("high", LIGHTING_TENDER, "23129", "19000", "05027"),
      // "Działki położone są na osiedlu „Niemirowska II”".
      ...streets("medium", PLOTS_FOR_SALE, "07059", "12991", "13998"),
    ],
  }),
];
