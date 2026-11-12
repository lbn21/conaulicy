// What goes in each bin, per gmina: the printable PDF's „Co wrzucać” page,
// one A4 page, the same for every address in the gmina: a tile per bin
// (BIN_TOKENS), then the waste handed in separately (SEPARATE_TOKENS) with
// where it goes, as a council's bin leaflet. Every item is
// copied word for word from the gmina's own official material (never
// reworded, never added, never borrowed from another gmina): a short,
// curated selection, at most SHORT_MAX a list, the same cap for every
// fraction; the full rules are one QR code away (fullRules). A fraction with
// no official source has no entry, and the PDF leaves its tile out. Keyed by
// the gmina's TERYT name (PlaceView.gmina) and, inside, by the bin colour
// token (lib/waste-bin.ts TOKEN), so "tworzywa" and "tworzywa_metale" share
// one tile. The PDF's „Co wrzucać” page links the full rules (fullRules,
// its QR code) and names the publisher and the day we checked it in its
// footer line.
//
// Items keep the source's own grammatical case: the town's guide lists its
// „no” items in the genitive („Nie należy wrzucać: …”), the gmina's booklet
// in the nominative; the PDF heads them „Tak” and „Nie”, which fits both.

import { tokenSubtype } from "./waste-bin.ts";

/** Items a short list may hold: the same for every fraction. */
export const SHORT_MAX = 3;

export type GuideSource = {
  id: string;
  label: string;
  url: string;
  /** The ISO day we last read the source and checked these lists. */
  checkedAt: string;
};

type GuideFraction = {
  /** Bin colour token (lib/waste-bin.ts TOKEN, lib/waste-colours.ts). */
  token: string;
  /** The bin or bag, as the gmina's regulamin colours it; null if none. */
  container: string | null;
  /** Curated, verbatim from the source: what goes in, what does not. */
  short: { yes: string[]; no: string[] };
  /**
   * Waste handed in separately (SEPARATE_TOKENS): where, as the source says
   * („zbiorka”: the collector's own collection days, which the calendar
   * shows); null for a bin's fraction.
   */
  where: Where[] | null;
  /** GuideSource ids. */
  sources: string[];
};

/** Where separately handed-in waste goes. */
type Where = "pszok" | "zbiorka";

/** The bins and bags, in the page's order: one large tile each. */
export const BIN_TOKENS = [
  "zmieszane",
  "popiol",
  "bio",
  "papier",
  "plastik-metale",
  "szklo",
] as const;
/** Waste handed in separately, in the page's order: one small item each. */
export const SEPARATE_TOKENS = [
  "gabaryty",
  "elektro",
  "opony",
  "tekstylia",
] as const;

/** Hazardous waste: never in a bin, to the gmina's collection point. */
export type GuidePszok = {
  place: string;
  /** Verbatim from the source, at most SHORT_MAX. */
  items: string[];
  sources: string[];
};

export type Guide = {
  /** Who publishes the rules, for the page's one source line. */
  publisher: string;
  /** The source with the full rules, behind the page's QR code. */
  fullRules: string;
  sources: GuideSource[];
  fractions: GuideFraction[];
  pszok: GuidePszok;
};

const CHECKED = "2026-11-11";

// Gmina Miejska Lubaczów: the town's waste site (czystylubaczow.info, the
// Urząd Miejski's) for the five main bins, its regulamin for the rest.
const TOWN_GUIDE: GuideSource = {
  id: "miasto-zasady",
  label: "Urząd Miejski w Lubaczowie, „Zasady segregacji odpadów”",
  url: "https://czystylubaczow.info/zasady-segregacji-odpadow/",
  checkedAt: CHECKED,
};
const TOWN_RULES: GuideSource = {
  id: "miasto-regulamin",
  label: "Regulamin utrzymania czystości i porządku, uchwała nr 101/X/2024",
  url: "https://edziennik.rzeszow.uw.gov.pl/WDU_R/2025/103/oryginal/akt.pdf",
  checkedAt: CHECKED,
};
const TOWN_PSZOK: GuideSource = {
  id: "miasto-pszok",
  label: "Urząd Miejski w Lubaczowie, „PSZOK”",
  url: "https://czystylubaczow.info/pszok-punkt-selektywnej-zbiorki-odpadow-komunlanych/",
  checkedAt: CHECKED,
};

// Gmina Lubaczów: its booklet „EKO GMINA LUBACZÓW – słownik segregacji”
// (pages 8–10 and 16–17) and its waste page, for the PSZOK; the bin colours
// from its regulamin (uchwała XXIII/238/2020, § 5 ust. 3 as amended by
// XXXVIII/385/2021).
const GMINA_BOOKLET: GuideSource = {
  id: "gmina-slownik",
  label: "Urząd Gminy Lubaczów, „Słownik segregacji”",
  url: "https://www.gminalubaczow.pl/wp-content/uploads/2026/01/EkoGminaKompendium.pdf",
  checkedAt: CHECKED,
};
const GMINA_RULES: GuideSource = {
  id: "gmina-regulamin",
  label:
    "Regulamin utrzymania czystości i porządku, uchwała nr XXXVIII/385/2021",
  url: "https://www.gminalubaczow.pl/wp-content/uploads/2024/11/URG_385_2021.pdf",
  checkedAt: CHECKED,
};
const GMINA_PAGE: GuideSource = {
  id: "gmina-pszok",
  label: "Urząd Gminy Lubaczów, „Odpady komunalne/PSZOK”",
  url: "https://www.gminalubaczow.pl/odpady-komunalne/",
  checkedAt: CHECKED,
};

const TOWN: Guide = {
  publisher: "Urząd Miejski w Lubaczowie",
  fullRules: TOWN_GUIDE.id,
  sources: [TOWN_GUIDE, TOWN_RULES, TOWN_PSZOK],
  fractions: [
    {
      token: "zmieszane",
      container: "czarny pojemnik lub worek",
      where: null,
      short: {
        yes: ["wszystko to, czego nie można odzyskać w procesie recyklingu"],
        no: [
          "odpadów niebezpiecznych",
          "odpadów rozbiórkowych i budowlanych",
          "tekstyliów i odzieży",
        ],
      },
      sources: [TOWN_GUIDE.id, TOWN_RULES.id],
    },
    {
      token: "popiol",
      container: "popielaty worek",
      where: null,
      short: { yes: ["popiół - jedynie w zabudowie jednorodzinnej"], no: [] },
      sources: [TOWN_RULES.id],
    },
    {
      token: "bio",
      container: "brązowy worek lub pojemnik",
      where: null,
      short: {
        yes: [
          "odpadki warzywne i owocowe (w tym obierki itp.)",
          "skoszoną trawę, liście, kwiaty",
          "resztki jedzenia",
        ],
        no: ["kości zwierząt", "oleju jadalnego", "drewna impregnowanego"],
      },
      sources: [TOWN_GUIDE.id, TOWN_RULES.id],
    },
    {
      token: "papier",
      container: "niebieski worek lub pojemnik",
      where: null,
      short: {
        yes: [
          "gazety i czasopisma",
          "zeszyty i książki",
          "torby i worki papierowe",
        ],
        no: [
          "papieru zatłuszczonego lub mocno zabrudzonego",
          "kartonów po mleku i napojach",
          "tapet",
        ],
      },
      sources: [TOWN_GUIDE.id, TOWN_RULES.id],
    },
    {
      token: "plastik-metale",
      container: "żółty worek lub pojemnik",
      where: null,
      short: {
        yes: [
          "odkręcone i zgniecione plastikowe butelki po napojach",
          "puszki po konserwach",
          "folię aluminiową",
        ],
        no: [
          "butelek i pojemników z zawartością",
          "plastikowych zabawek",
          "zużytych baterii i akumulatorów",
        ],
      },
      sources: [TOWN_GUIDE.id, TOWN_RULES.id],
    },
    {
      token: "szklo",
      container: "zielony worek lub pojemnik",
      where: null,
      short: {
        yes: ["butelki i słoiki po napojach i żywności"],
        no: [
          "ceramiki, doniczek, porcelany, fajansu, kryształów",
          "szkła żaroodpornego",
          "luster",
        ],
      },
      sources: [TOWN_GUIDE.id, TOWN_RULES.id],
    },
    {
      token: "gabaryty",
      container: null,
      short: { yes: ["meble i inne odpady wielkogabarytowe"], no: [] },
      // § 3 ust. 1 pkt 9: by the collector's schedule or at the PSZOK.
      where: ["zbiorka", "pszok"],
      sources: [TOWN_RULES.id],
    },
    {
      token: "elektro",
      container: null,
      short: { yes: ["zużyty sprzęt elektryczny i elektroniczny"], no: [] },
      // § 3 ust. 1 pkt 8: the PSZOK, a shop, or the collector's schedule.
      where: ["pszok", "zbiorka"],
      sources: [TOWN_RULES.id],
    },
    {
      token: "opony",
      container: null,
      short: { yes: ["zużyte opony"], no: [] },
      // § 3 ust. 1 pkt 10: by the collector's schedule or at the PSZOK.
      where: ["zbiorka", "pszok"],
      sources: [TOWN_RULES.id],
    },
    {
      token: "tekstylia",
      container: null,
      short: { yes: ["odpady tekstyliów i odzieży"], no: [] },
      // The PSZOK's regulamin, § 4 p); no collection day for them.
      where: ["pszok"],
      sources: [TOWN_RULES.id, TOWN_PSZOK.id],
    },
  ],
  pszok: {
    place: "PSZOK, ul. Inżynierska 12",
    items: [
      "zużyte baterie i akumulatory",
      "przeterminowane leki",
      "chemikalia",
    ],
    sources: [TOWN_RULES.id, TOWN_PSZOK.id],
  },
};

const GMINA: Guide = {
  publisher: "Urząd Gminy Lubaczów",
  fullRules: GMINA_BOOKLET.id,
  sources: [GMINA_BOOKLET, GMINA_RULES, GMINA_PAGE],
  fractions: [
    {
      token: "zmieszane",
      container: "czarny pojemnik lub worek",
      where: null,
      short: {
        yes: ["pieluchy", "resztki mięsa i kości", "wystudzony popiół"],
        no: [],
      },
      sources: [GMINA_BOOKLET.id, GMINA_RULES.id],
    },
    {
      token: "bio",
      container: "brązowy worek lub pojemnik",
      where: null,
      short: {
        yes: [
          "skoszona trawa",
          "liście",
          "obierki, skórki, ogryzki, zgniłe owoce",
        ],
        no: ["resztki mięsa", "kości", "pozostałości ryb"],
      },
      sources: [GMINA_BOOKLET.id, GMINA_RULES.id],
    },
    {
      token: "papier",
      container: "niebieski worek lub pojemnik",
      where: null,
      short: {
        yes: ["gazety", "koperty", "kartony i tektura"],
        no: [
          "papier lakierowany i foliowany",
          "paragony",
          "kartoniki po sokach, mleku lub śmietanie",
        ],
      },
      sources: [GMINA_BOOKLET.id, GMINA_RULES.id],
    },
    {
      token: "plastik-metale",
      container: "żółty worek lub pojemnik",
      where: null,
      short: {
        yes: [
          "butelki plastikowe",
          "puszki po napojach",
          "opakowania Tetra Pak np. po napojach i mleku",
        ],
        no: [],
      },
      sources: [GMINA_BOOKLET.id, GMINA_RULES.id],
    },
    {
      token: "szklo",
      container: "zielony worek lub pojemnik",
      where: null,
      short: {
        yes: [
          "butelki szklane po napojach i żywności",
          "słoiki szklane po napojach i żywności",
        ],
        no: [
          "kieliszków, filiżanek, talerzyków, wazoników",
          "wszelkiej ceramiki, porcelany i fajansu",
          "stłuczki szklanej, np. z szyb okiennych",
        ],
      },
      sources: [GMINA_BOOKLET.id, GMINA_RULES.id],
    },
    {
      token: "gabaryty",
      container: null,
      short: {
        yes: [
          "szafy, regały, biurka",
          "fotele, tapczany, łóżka",
          "dywany, wykładziny",
        ],
        no: [],
      },
      // The booklet, p. 17: to the PSZOK; its „mobilne zbiórki odpadów
      // wielkogabarytowych”.
      where: ["zbiorka", "pszok"],
      sources: [GMINA_BOOKLET.id],
    },
    {
      token: "elektro",
      container: null,
      short: {
        yes: ["sprzęt RTV i AGD", "drobny sprzęt AGD", "sprzęt komputerowy"],
        no: [],
      },
      // The booklet, p. 17: to the PSZOK, „również podczas mobilnych
      // zbiórek odpadów wielkogabarytowych”.
      where: ["pszok", "zbiorka"],
      sources: [GMINA_BOOKLET.id],
    },
  ],
  pszok: {
    place: "PSZOK, Załuże 361",
    items: [
      "baterie i akumulatory",
      "przeterminowane leki",
      "farby, lakiery i kleje",
    ],
    sources: [GMINA_BOOKLET.id, GMINA_PAGE.id],
  },
};

export const GUIDES: Record<string, Guide> = {
  "Lubaczów (miasto)": TOWN,
  "Lubaczów (gmina)": GMINA,
};

/** A guide entry with the subtype that names it (lib/waste-bin.ts FRACTIONS). */
export type GuideItem = GuideFraction & { subtype: string };

/**
 * A gmina's „Co wrzucać” page, the same for every address in it: a tile
 * per bin its guide covers (BIN_TOKENS order), the waste handed in
 * separately (SEPARATE_TOKENS order), the PSZOK line, the source with the
 * full rules, and every source these cite. Null when the gmina has no guide.
 */
export function guideFor(gmina: string): {
  publisher: string;
  fullRules: GuideSource;
  bins: GuideItem[];
  separate: GuideItem[];
  pszok: GuidePszok;
  sources: GuideSource[];
} | null {
  const guide = GUIDES[gmina];
  if (!guide) return null;
  const pick = (tokens: readonly string[]) =>
    tokens.flatMap((token) => {
      const entry = guide.fractions.find((f) => f.token === token);
      return entry ? [{ ...entry, subtype: tokenSubtype(token) }] : [];
    });
  const bins = pick(BIN_TOKENS);
  const separate = pick(SEPARATE_TOKENS);
  const fullRules = guide.sources.find((s) => s.id === guide.fullRules);
  if (bins.length === 0 || !fullRules) return null;
  const used = new Set([
    guide.fullRules,
    ...[...bins, ...separate].flatMap((item) => item.sources),
    ...guide.pszok.sources,
  ]);
  return {
    publisher: guide.publisher,
    fullRules,
    bins,
    separate,
    pszok: guide.pszok,
    sources: guide.sources.filter((source) => used.has(source.id)),
  };
}
