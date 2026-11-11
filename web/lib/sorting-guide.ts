// What goes in each bin, per gmina: the printable PDF's „Co wrzucać” page,
// one A4 page of equal tiles, as a council's bin leaflet. Every item is
// copied word for word from the gmina's own official material (never
// reworded, never added, never borrowed from another gmina): a short,
// curated selection, at most SHORT_MAX a list, the same cap for every
// fraction; the full rules are one QR code away (fullRules). A fraction with
// no official source has no entry, and the PDF leaves its tile out. Keyed by
// the gmina's TERYT name (PlaceView.gmina) and, inside, by the bin colour
// token (lib/waste-bin.ts TOKEN), so "tworzywa" and "tworzywa_metale" share
// one tile. The PDF's text version lists every source with its link and the
// day we checked it (the hard rule in CLAUDE.md).
//
// Items keep the source's own grammatical case: the town's guide lists its
// „no” items in the genitive („Nie należy wrzucać: …”), the gmina's booklet
// in the nominative; the PDF heads them „Tak” and „Nie”, which fits both.

import { TOKEN, tones } from "./waste-bin.ts";

/** Items a short list may hold: the same for every fraction. */
export const SHORT_MAX = 3;

export type GuideSource = {
  id: string;
  label: string;
  url: string;
  /** The ISO day we last read the source and checked these lists. */
  checkedAt: string;
};

export type GuideFraction = {
  /** Bin colour token (lib/waste-bin.ts TOKEN, lib/waste-colours.ts). */
  token: string;
  /** The bin or bag, as the gmina's regulamin colours it; null if none. */
  container: string | null;
  /** Curated, verbatim from the source: what goes in, what does not. */
  short: { yes: string[]; no: string[] };
  /** GuideSource ids. */
  sources: string[];
};

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
      short: { yes: ["popiół - jedynie w zabudowie jednorodzinnej"], no: [] },
      sources: [TOWN_RULES.id],
    },
    {
      token: "bio",
      container: "brązowy worek lub pojemnik",
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
      sources: [TOWN_RULES.id],
    },
    {
      token: "elektro",
      container: null,
      short: { yes: ["zużyty sprzęt elektryczny i elektroniczny"], no: [] },
      sources: [TOWN_RULES.id],
    },
    {
      token: "opony",
      container: null,
      short: { yes: ["zużyte opony"], no: [] },
      sources: [TOWN_RULES.id],
    },
    {
      token: "tekstylia",
      container: null,
      short: { yes: ["odpady tekstyliów i odzieży"], no: [] },
      sources: [TOWN_RULES.id],
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
      short: {
        yes: ["pieluchy", "resztki mięsa i kości", "wystudzony popiół"],
        no: [],
      },
      sources: [GMINA_BOOKLET.id, GMINA_RULES.id],
    },
    {
      token: "bio",
      container: "brązowy worek lub pojemnik",
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

/**
 * A place's „Co wrzucać” page: a tile for each of its fractions the gmina's
 * guide covers, in the given order (the site's), the PSZOK line, the source
 * with the full rules, and every source these cite. Null when the gmina has
 * no guide or none of its fractions has an entry.
 */
export function guideFor(
  gmina: string,
  subtypes: string[],
): {
  publisher: string;
  fullRules: GuideSource;
  tiles: Array<GuideFraction & { subtype: string }>;
  pszok: GuidePszok;
  sources: GuideSource[];
} | null {
  const guide = GUIDES[gmina];
  if (!guide) return null;
  const tiles: Array<GuideFraction & { subtype: string }> = [];
  for (const subtype of subtypes.flatMap(tones)) {
    const token = TOKEN[subtype];
    if (tiles.some((tile) => tile.token === token)) continue;
    const entry = guide.fractions.find((f) => f.token === token);
    if (entry) tiles.push({ ...entry, subtype });
  }
  const fullRules = guide.sources.find((s) => s.id === guide.fullRules);
  if (tiles.length === 0 || !fullRules) return null;
  const used = new Set([
    guide.fullRules,
    ...tiles.flatMap((tile) => tile.sources),
    ...guide.pszok.sources,
  ]);
  return {
    publisher: guide.publisher,
    fullRules,
    tiles,
    pszok: guide.pszok,
    sources: guide.sources.filter((source) => used.has(source.id)),
  };
}
