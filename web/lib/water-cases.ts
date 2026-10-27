// The prompt's regression cases (task 182): the real posts whose traps the
// old word rules of the gate were written for, each with the reading the
// prompt (lib/water-prompt.ts) must give, written by hand, never a real
// call. The gate's own tests run them (lib/water-cases.test.ts); a dry run
// with the real model compares its output with `expected`
// (scripts/water-dry-run.ts --case). A post the model gets wrong is a new
// case here and a rewrite of the prompt, never a rule of the gate. A
// fixture, so code (scripts/check-tracked-data.mjs).

import {
  CICHA,
  CUT_99,
  CUT_100,
  MZGKIM_READINGS,
  realMzgkimPost,
  WITH_ESTATE,
} from "./mzgkim-fixture.ts";
import type { WaterSourceId } from "./water-sources.ts";
import type { ZukPost } from "./zuk.ts";
import type { AiItem, AiResult } from "./zuk-ai.ts";
import {
  AI_ITEM,
  POST_39885_EDITED,
  reading,
  reading39885Edited,
  realPosts,
} from "./zuk-fixture.ts";

export type WaterCase = {
  id: number;
  source: WaterSourceId;
  /** What the post makes easy to read wrongly. */
  trap: string;
  post: () => ZukPost;
  expected: () => AiResult;
};

/** Two gmina posts of 2025 (task 114b's golden set), title and text. */
const TYMCE = {
  31662: {
    date: "2025-04-28T09:20:16",
    link: "https://www.gminalubaczow.pl/2025/04/28/przerwa-w-dostawie-wody-tymce-zaluze-od-263-do-344-oraz-nowe-siolo-od-161-do-163/",
    title:
      "Przerwa w dostawie wody (Tymce, Załuże od 263 do 344 oraz Nowe Sioło od 161 do 163)",
    when: "w dniach 29.04.2025 (wtorek) i 30.04.2025 (środa)",
    days: [
      ["2025-04-29", "29.04.2025"],
      ["2025-04-30", "30.04.2025"],
    ],
  },
  31782: {
    date: "2025-05-05T13:25:27",
    link: "https://www.gminalubaczow.pl/2025/05/05/przerwa-w-dostawie-wody-7-05-2025-r-tymce-zaluze-od-263-do-344-oraz-nowe-siolo-od-161-do-163/",
    title:
      "Przerwa w dostawie wody 7.05.2025 r. (Tymce, Załuże od 263 do 344 oraz Nowe Sioło od 161 do 163)",
    when: "w dniu 7.05.2025 (środa)",
    days: [["2025-05-07", "7.05.2025"]],
  },
};

function tymcePost(id: keyof typeof TYMCE): ZukPost {
  const t = TYMCE[id];
  const lines = [
    `Zakład Usług Komunalnych Sp. z o.o. w Mokrzycy informuje, że ${t.when} w godz. od 8:00 do 15:00 nastąpi przerwa w dostawie wody dla mieszkańców miejscowości Tymce oraz części miejscowości Załuże od numeru 263 do numeru 344 i Nowe Sioło od numeru 161 do numeru 163.`,
    "Powyższa przerwa wynika z konieczności przeprowadzenia prac modernizacyjnych (wymiana węzłów i hydrantów).",
    "Za utrudnienia przepraszamy.",
    "Prezes ZUK Sp. z o.o.",
  ];
  return {
    id,
    date: t.date,
    modified: t.date,
    link: t.link,
    title: { rendered: t.title },
    content: { rendered: lines.map((l) => `<p>${l}</p>`).join("") },
  };
}

/**
 * Tymce whole, Załuże's houses (its "części miejscowości" before the name,
 * the range one quote after it), and Nowe Sioło, not ours, still returned.
 */
function tymceReading(id: keyof typeof TYMCE): AiResult {
  const place = (
    [date, written]: string[],
    locality: string | null,
    verbatim: string,
    note: string | null,
    houses: AiItem["houses"],
  ): AiItem => ({
    date,
    start: "08:00",
    end: "15:00",
    locality,
    locality_verbatim: verbatim,
    street: null,
    street_verbatim: null,
    note,
    kind: "planned",
    ...AI_ITEM,
    date_verbatim: written,
    houses,
  });
  return {
    post_type: "water_outage",
    quality_status: null,
    is_past: false,
    changes_earlier_dates: false,
    items: TYMCE[id].days.flatMap((day) => [
      place(day, "Tymce", "Tymce", null, []),
      place(day, "Załuże", "Załuże", "od numeru 263 do numeru 344", [
        { from: "263", to: "344" },
      ]),
      place(day, null, "Nowe Sioło", "od numeru 161 do numeru 163", [
        { from: "161", to: "163" },
      ]),
    ]),
  };
}

const gmina = (id: number) => () => {
  const post = realPosts().find((p) => p.id === id);
  if (!post) throw new Error(`no real post ${id}`);
  return post;
};

export const WATER_CASES: WaterCase[] = [
  {
    id: 39885,
    source: "gmina-lubaczow",
    trap: '"Dąbków, Lubaczów ul. Żuki, Opaka od numeru 104 do 110": the town\'s ul. Żuki (Dąbków has one too, Opaka a part Żuki); "ul. Przemysłowa (Lubaczów)" the town\'s; Lisie Jamy whole on 26 and 29.10, four of its streets on 27.10 (the edit)',
    post: () => POST_39885_EDITED,
    // The edit corrects the earlier version's 27.10 extent.
    expected: () => ({ ...reading39885Edited(), changes_earlier_dates: true }),
  },
  {
    id: 39766,
    source: "gmina-lubaczow",
    trap: '"Wólka Krowicka od nr 144 do nr 159": never the whole village',
    post: gmina(39766),
    expected: () => reading(39766),
  },
  {
    id: 39699,
    source: "gmina-lubaczow",
    trap: '"Basznia Górna od numeru 121 do numeru 144 (przysiółek Dąbrowa)": the hamlet, a listed part, never the village or the village Dąbrowa',
    post: gmina(39699),
    expected: () => reading(39699),
  },
  {
    id: 26028,
    source: "gmina-lubaczow",
    trap: '"w części miejscowości Bałaje", "ul. Przemysłowa (gospodarstwa zasilane z SUW Mokrzyca)": in part, never whole, never Mokrzyca; "Załuże (Podłęże)" an unlisted part in the note',
    post: gmina(26028),
    expected: () => reading(26028),
  },
  {
    id: 39495,
    source: "gmina-lubaczow",
    trap: '"Lisie Jamy: ul. Polna, Basznia Górna od nr 92 do nr 120": the street only, never the whole of Lisie Jamy',
    post: gmina(39495),
    expected: () => reading(39495),
  },
  {
    id: 23860,
    source: "gmina-lubaczow",
    trap: '"2.11.2023, 3.11.2023 oraz od 06.11.2023 do 10.11.2023": every day of the range',
    post: gmina(23860),
    expected: () => reading(23860),
  },
  {
    id: 31662,
    source: "gmina-lubaczow",
    trap: '"części miejscowości Załuże od numeru 263 do numeru 344 i Nowe Sioło …": the note one quote, never spliced; Nowe Sioło (not ours) returned unlisted',
    post: () => tymcePost(31662),
    expected: () => tymceReading(31662),
  },
  {
    id: 31782,
    source: "gmina-lubaczow",
    trap: "the same as 31662, one day",
    post: () => tymcePost(31782),
    expected: () => tymceReading(31782),
  },
  {
    id: CUT_100,
    source: "mzgkim",
    trap: 'streets declined ("Niemirowskiej"), the town never named; "Osiedle domów jednorodzinnych na zapleczu" / "ul. Niemirowskiej" one district over two lines, never ul. Niemirowska again; "Osiedle Mazury" the district',
    post: () => realMzgkimPost(CUT_100),
    expected: () => MZGKIM_READINGS[CUT_100],
  },
  {
    id: CUT_99,
    source: "mzgkim",
    trap: '"Sobieskiego (od siedziby Straży Pożarnej w kierunku Dąbrowy)": the street in part, Dąbrowa only a landmark',
    post: () => realMzgkimPost(CUT_99),
    expected: () => MZGKIM_READINGS[CUT_99],
  },
  {
    id: WITH_ESTATE,
    source: "mzgkim",
    trap: '"Mazury wraz z osiedlem", "Niemirowska wraz z osiedlem": each the street whole and the district, two items',
    post: () => realMzgkimPost(WITH_ESTATE),
    expected: () => MZGKIM_READINGS[WITH_ESTATE],
  },
  {
    id: CICHA,
    source: "mzgkim",
    trap: '"…, Walecznych, Cicha, ul. Młodowska (Młodów).": Cicha kept whole; ul. Młodowska the town\'s street, the village where it leads',
    post: () => realMzgkimPost(CICHA),
    expected: () => MZGKIM_READINGS[CICHA],
  },
];
