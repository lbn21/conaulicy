// What goes in each bin, per gmina: the printable PDF's „Co wrzucać” page.
// Every list is copied from the gmina's own official material, never written
// by us and never borrowed from another gmina; each fraction names its
// source, and the PDF prints each source's link and the day we last checked
// it (the hard rule in CLAUDE.md). A fraction with no official source has no
// entry, and the PDF leaves its tile out. Keyed by the gmina's TERYT name
// (PlaceView.gmina) and, inside, by the bin colour token (lib/waste-bin.ts
// TOKEN), so "tworzywa" and "tworzywa_metale" share one tile.
//
// Wording: „yes” items as the source lists them (what you put in), „no”
// items in the genitive, after „Nie wrzucaj”, as the town's guide has them;
// the gmina's booklet states its „no” items in sentences (pages 8–10), here
// shortened to the same form.

import { TOKEN, tones } from "./waste-bin.ts";

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
  yes: string[];
  no: string[];
  tips: string[];
  /** GuideSource ids. */
  sources: string[];
};

/** Hazardous waste: never in a bin, always to the gmina's collection point. */
export type GuideHazard = {
  place: string;
  items: string[];
  tips: string[];
  sources: string[];
};

export type Guide = {
  sources: GuideSource[];
  fractions: GuideFraction[];
  hazard: GuideHazard;
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
  sources: [TOWN_GUIDE, TOWN_RULES, TOWN_PSZOK],
  fractions: [
    {
      token: "zmieszane",
      container: "czarny pojemnik lub worek",
      yes: ["wszystko, czego nie można odzyskać w recyklingu"],
      no: [
        "odpadów niebezpiecznych",
        "odpadów budowlanych i rozbiórkowych",
        "tekstyliów i odzieży",
      ],
      tips: [],
      sources: [TOWN_GUIDE.id, TOWN_RULES.id],
    },
    {
      token: "popiol",
      container: "popielaty worek",
      yes: ["popiół – tylko z domów jednorodzinnych"],
      no: [],
      tips: ["Możesz go też oddać w PSZOK."],
      sources: [TOWN_RULES.id],
    },
    {
      token: "bio",
      container: "brązowy worek lub pojemnik",
      yes: [
        "odpadki warzywne i owocowe (w tym obierki)",
        "skoszoną trawę, liście, kwiaty",
        "trociny i korę drzew",
        "niezaimpregnowane drewno",
        "gałęzie drzew i krzewów",
        "resztki jedzenia",
      ],
      no: [
        "kości zwierząt",
        "oleju jadalnego",
        "odchodów zwierząt",
        "popiołu z węgla kamiennego",
        "leków",
        "drewna impregnowanego",
        "płyt wiórowych i pilśniowych MDF",
        "ziemi i kamieni",
        "innych odpadów komunalnych (w tym niebezpiecznych)",
      ],
      tips: [],
      sources: [TOWN_GUIDE.id, TOWN_RULES.id],
    },
    {
      token: "papier",
      container: "niebieski worek lub pojemnik",
      yes: [
        "opakowania z papieru, karton, tekturę (także falistą)",
        "katalogi, ulotki, prospekty",
        "gazety i czasopisma",
        "papier szkolny i biurowy, zadrukowane kartki",
        "zeszyty i książki",
        "papier pakowy",
        "torby i worki papierowe",
      ],
      no: [
        "ręczników papierowych i zużytych chusteczek higienicznych",
        "papieru lakierowanego i powleczonego folią",
        "papieru zatłuszczonego lub mocno zabrudzonego",
        "kartonów po mleku i napojach",
        "papierowych worków po nawozach i materiałach budowlanych",
        "tapet",
        "pieluch jednorazowych i innych materiałów higienicznych",
        "zatłuszczonych opakowań i naczyń jednorazowych z papieru",
        "ubrań",
      ],
      tips: [],
      sources: [TOWN_GUIDE.id, TOWN_RULES.id],
    },
    {
      token: "plastik-metale",
      container: "żółty worek lub pojemnik",
      yes: [
        "odkręcone i zgniecione plastikowe butelki po napojach",
        "nakrętki, kapsle, zakrętki od słoików",
        "plastikowe opakowania po produktach spożywczych",
        "opakowania wielomateriałowe (np. kartony po mleku i sokach)",
        "opakowania po środkach czystości i kosmetykach",
        "plastikowe torby, worki, reklamówki, inne folie",
        "puszki po napojach, sokach i konserwach",
        "folię aluminiową, metale kolorowe",
      ],
      no: [
        "butelek i pojemników z zawartością",
        "plastikowych zabawek",
        "opakowań po lekach i zużytych artykułów medycznych",
        "opakowań po olejach silnikowych",
        "części samochodowych",
        "zużytych baterii i akumulatorów",
        "puszek i pojemników po farbach i lakierach",
        "zużytego sprzętu elektronicznego i AGD",
      ],
      tips: [],
      sources: [TOWN_GUIDE.id, TOWN_RULES.id],
    },
    {
      token: "szklo",
      container: "zielony worek lub pojemnik",
      yes: [
        "butelki i słoiki po napojach i żywności (także po alkoholu i olejach roślinnych)",
        "szklane opakowania po kosmetykach (jeśli nie są połączone z innym materiałem)",
      ],
      no: [
        "ceramiki, doniczek, porcelany, fajansu, kryształów",
        "szkła okularowego i żaroodpornego",
        "zniczy z zawartością wosku",
        "żarówek i świetlówek",
        "reflektorów",
        "opakowań po lekach, rozpuszczalnikach, olejach silnikowych",
        "luster, szyb okiennych i zbrojonych",
        "monitorów i lamp telewizyjnych",
        "termometrów i strzykawek",
      ],
      tips: ["Nie tłucz szkła przed wrzuceniem."],
      sources: [TOWN_GUIDE.id, TOWN_RULES.id],
    },
    {
      token: "gabaryty",
      container: null,
      yes: ["meble i inne odpady wielkogabarytowe"],
      no: [],
      tips: [
        "Możesz je wystawić najwcześniej 48 godzin przed odbiorem.",
        "Możesz je też oddać w PSZOK.",
      ],
      sources: [TOWN_RULES.id],
    },
    {
      token: "elektro",
      container: null,
      yes: ["zużyty sprzęt elektryczny i elektroniczny"],
      no: [],
      tips: [
        "Możesz go też oddać w PSZOK albo w sklepie, gdy kupujesz nowy sprzęt tego samego rodzaju.",
      ],
      sources: [TOWN_RULES.id],
    },
    {
      token: "opony",
      container: null,
      yes: ["zużyte opony"],
      no: [],
      tips: ["Możesz je też oddać w PSZOK."],
      sources: [TOWN_RULES.id],
    },
    {
      token: "tekstylia",
      container: null,
      yes: ["odpady tekstyliów i odzieży"],
      no: [],
      tips: ["Możesz je też oddać w PSZOK."],
      sources: [TOWN_RULES.id, TOWN_PSZOK.id],
    },
  ],
  hazard: {
    place: "PSZOK, ul. Inżynierska 12",
    items: [
      "zużyte baterie i akumulatory",
      "przeterminowane leki",
      "chemikalia",
      "igły i strzykawki",
      "inne odpady niebezpieczne",
    ],
    tips: [
      "Leki także do pojemników w aptekach, baterie także do sklepów, które je sprzedają.",
    ],
    sources: [TOWN_RULES.id, TOWN_PSZOK.id],
  },
};

const GMINA: Guide = {
  sources: [GMINA_BOOKLET, GMINA_RULES, GMINA_PAGE],
  fractions: [
    {
      token: "zmieszane",
      container: "czarny pojemnik lub worek",
      yes: [
        "szkło stołowe, kryształy, fajans i porcelanę",
        "artykuły higieniczne (podpaski, patyczki, waciki), pieluchy",
        "gumowe rękawiczki i maseczki ochronne",
        "znicze z zawartością wosku, resztki świec",
        "drobne zepsute zabawki (wielomateriałowe)",
        "odchody zwierząt",
        "resztki mięsa, kości, ryb i owoców morza",
        "tłuste resztki kuchenne",
        "zabrudzony i tłusty papier, zużyte ręczniki papierowe i serwetki",
        "niedopałki papierosów",
        "wystudzony popiół",
      ],
      no: [],
      tips: ["Tylko to, czego nie da się posegregować."],
      sources: [GMINA_BOOKLET.id, GMINA_RULES.id],
    },
    {
      token: "bio",
      container: "brązowy worek lub pojemnik",
      yes: [
        "skoszoną trawę, liście",
        "gałązki krzewów",
        "rośliny doniczkowe, kwiaty",
        "obierki, skórki, ogryzki, zgniłe owoce",
        "łupiny orzechów, skorupki jaj",
        "fusy po herbacie i kawie",
      ],
      no: ["resztek mięsa, kości i ryb"],
      tips: ["Odpady zielone rozdrobnij, żeby zmieściły się w pojemniku."],
      sources: [GMINA_BOOKLET.id, GMINA_RULES.id],
    },
    {
      token: "papier",
      container: "niebieski worek lub pojemnik",
      yes: [
        "gazety, papier szkolny i biurowy",
        "książki i zeszyty (bez foliowanych okładek)",
        "koperty, papier pakowy i dekoracyjny",
        "opakowania kartonowe, kartony i tekturę",
        "rolki papieru i gilzy",
      ],
      no: [
        "papieru lakierowanego i foliowanego (np. okładek czasopism)",
        "papieru termicznego i paragonów",
        "chusteczek higienicznych, maseczek, pieluch, podpasek",
        "kartoników po sokach i mleku (do żółtego)",
      ],
      tips: ["Kartony złóż. Papier ma być suchy i niezatłuszczony."],
      sources: [GMINA_BOOKLET.id, GMINA_RULES.id],
    },
    {
      token: "plastik-metale",
      container: "żółty worek lub pojemnik",
      yes: [
        "siatki, torebki, worki i folie opakowaniowe",
        "butelki plastikowe i plastikowe zakrętki",
        "plastikowe opakowania po środkach czystości i kosmetykach",
        "opakowania po produktach spożywczych",
        "puszki po konserwach i napojach",
        "metalowe zakrętki, korki i kapsle",
        "opakowania z folii aluminiowej",
        "opakowania Tetra Pak (np. po napojach i mleku)",
        "opakowania po kawie, słodyczach, chipsach",
        "opakowania po dezodorantach",
      ],
      no: [],
      tips: ["Opakowania opróżnij i zgnieć."],
      sources: [GMINA_BOOKLET.id, GMINA_RULES.id],
    },
    {
      token: "szklo",
      container: "zielony worek lub pojemnik",
      yes: [
        "butelki i słoiki szklane po napojach i żywności",
        "szklane opakowania po kosmetykach i perfumach",
      ],
      no: [
        "szklanek, kieliszków, filiżanek, talerzyków",
        "wazoników",
        "ceramiki, porcelany, fajansu, kryształów",
        "szkła z szyb okiennych",
      ],
      tips: [
        "Opróżnij i zdejmij nakrętki. Etykiet nie trzeba zrywać ani myć słoików.",
      ],
      sources: [GMINA_BOOKLET.id, GMINA_RULES.id],
    },
    {
      token: "gabaryty",
      container: null,
      yes: [
        "szafy, regały, biurka",
        "fotele, tapczany, łóżka",
        "plastikowe krzesła i stoliki",
        "materace, kołdry i poduszki",
        "dywany, wykładziny",
        "duże lustra, okna, drzwi",
      ],
      no: [],
      tips: [
        "Na tę zbiórkę oddasz też zużyty sprzęt elektryczny – w całości, nierozkręcony.",
        "Możesz je też oddać w PSZOK.",
      ],
      sources: [GMINA_BOOKLET.id],
    },
  ],
  hazard: {
    place: "PSZOK, Załuże 361",
    items: [
      "baterie i akumulatory",
      "przeterminowane leki",
      "farby, lakiery i kleje",
      "substancje chemiczne",
      "lampy rtęciowe, świetlówki",
      "rozpuszczalniki i rozcieńczalniki",
      "impregnowane drewno",
    ],
    tips: [
      "Leki także do pojemnika w aptece. Odpady z azbestem odbierają tylko wyspecjalizowane firmy.",
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
 * guide covers, in the given order (the site's), its hazardous-waste note,
 * and the sources these cite. Null when the gmina has no guide or none of
 * its fractions has an entry.
 */
export function guideFor(
  gmina: string,
  subtypes: string[],
): {
  tiles: Array<GuideFraction & { subtype: string }>;
  hazard: GuideHazard;
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
  if (tiles.length === 0) return null;
  const used = new Set([
    ...tiles.flatMap((tile) => tile.sources),
    ...guide.hazard.sources,
  ]);
  return {
    tiles,
    hazard: guide.hazard,
    sources: guide.sources.filter((source) => used.has(source.id)),
  };
}
