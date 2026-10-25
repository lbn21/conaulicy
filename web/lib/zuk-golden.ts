// The v3.1 golden set (task 114b, the X8 handoff's golden.json, as is):
// real gmina posts, grok-4.7's recorded replies with the v3.1 prompt
// (lib/sources/gmina-lubaczow/prompt.ts; reasoning low, temp. 0), and the
// hand-checked gate result per item, in item order. `negatives`: replies
// of the older v3 prompt the gate must drop. A fixture, so code
// (scripts/check-tracked-data.mjs).

import type { AiResult } from "./zuk-ai.ts";

export type GoldenPost = {
  id: number;
  link: string;
  published: string;
  title: string;
  text: string;
  model_output: AiResult;
  expected: Array<{
    kept: boolean;
    reason: string | null;
    resolved?: {
      date: string;
      localityId: string;
      locality: string;
      streetId: string | null;
      street: string | null;
      note: string | null;
    };
  }>;
};

export const GOLDEN: {
  about: string;
  places: string;
  posts: GoldenPost[];
  negatives_about: string;
  negatives: GoldenPost[];
} = JSON.parse(`{
 "about": "v3.1 golden set: recorded inputs and grok-4.7 outputs (prompt system_prompt_v31, schema-v31.json, reasoning low, temperature 0) and the hand-checked gate result per item, in item order. The model input is the user message 'Publish date: {published}\\\\nTitle: {title}\\\\n\\\\nText:\\\\n{text}'. text = post HTML with <br> and block-element ends turned into line breaks, tags removed, entities unescaped, nbsp -> space, runs of spaces/tabs collapsed, lines trimmed, empty lines dropped. Places: places-v31.json (TERYT 2026-10-18).",
 "places": "places-v31.json",
 "posts": [
  {
   "id": 37920,
   "link": "https://www.gminalubaczow.pl/2026/06/05/przerwa-w-dostawie-wody-w-mlodowie-8-06-2026r/",
   "published": "2026-06-05T19:58:08",
   "title": "Przerwa w dostawie wody w miejscowości Młodów (8.06.2026r.)",
   "text": "Zakład Usług Komunalnych Sp. z o.o. informuje, że w związku z koniecznością przeprowadzenia prac konserwacyjnych na sieci wodociągowej nastąpi czasowa przerwa w dostawie wody w miejscowości Młodów:\\n-ul. Kościuszki – numery nieparzyste od 13 do 21 oraz numery parzyste od 2 do 82,\\n-ul. Szkolna – numery nieparzyste od 7 do 25 oraz numery parzyste od 2 do 8,\\n-ul. Majowa – wszystkie posesje.\\nPrace będą prowadzone w dniu 8 czerwca 2026 r. (poniedziałek) w godzinach od 8:00 do 15:00.\\nProsimy mieszkańców o wcześniejsze zabezpieczenie odpowiedniej ilości wody na potrzeby gospodarstw domowych. Po zakończeniu prac i przywróceniu dostawy wody może wystąpić przejściowa zmiana jej parametrów, w szczególności barwy i mętności. Przepraszamy za powstałe utrudnienia i dziękujemy za wyrozumiałość.\\nZakład Usług Komunalnych Sp. z o.o.\\nw Mokrzycy",
   "model_output": {
    "post_type": "water_outage",
    "quality_status": null,
    "is_past": false,
    "items": [
     {
      "date": "2026-06-08",
      "start": "08:00",
      "end": "15:00",
      "locality": "Młodów",
      "locality_verbatim": "Młodów",
      "street": "Tadeusza Kościuszki",
      "street_verbatim": "ul. Kościuszki",
      "note": "numery nieparzyste od 13 do 21 oraz numery parzyste od 2 do 82",
      "kind": "planned"
     },
     {
      "date": "2026-06-08",
      "start": "08:00",
      "end": "15:00",
      "locality": "Młodów",
      "locality_verbatim": "Młodów",
      "street": "Szkolna",
      "street_verbatim": "ul. Szkolna",
      "note": "numery nieparzyste od 7 do 25 oraz numery parzyste od 2 do 8",
      "kind": "planned"
     },
     {
      "date": "2026-06-08",
      "start": "08:00",
      "end": "15:00",
      "locality": "Młodów",
      "locality_verbatim": "Młodów",
      "street": "Majowa",
      "street_verbatim": "ul. Majowa",
      "note": null,
      "kind": "planned"
     }
    ]
   },
   "expected": [
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-06-08",
      "localityId": "0606286",
      "locality": "Młodów",
      "streetId": "0606286-09582",
      "street": "Tadeusza Kościuszki",
      "note": "numery nieparzyste od 13 do 21 oraz numery parzyste od 2 do 82"
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-06-08",
      "localityId": "0606286",
      "locality": "Młodów",
      "streetId": "0606286-21970",
      "street": "Szkolna",
      "note": "numery nieparzyste od 7 do 25 oraz numery parzyste od 2 do 8"
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-06-08",
      "localityId": "0606286",
      "locality": "Młodów",
      "streetId": "0606286-11988",
      "street": "Majowa",
      "note": null
     }
    }
   ]
  },
  {
   "id": 37682,
   "link": "https://www.gminalubaczow.pl/2026/05/13/przerwa-w-dostawie-wody-krowica-sama-os-wolnosci-krowica-holodowska-od-numeru-123-do-numeru-172-oraz-budomierz/",
   "published": "2026-05-13T08:27:29",
   "title": "Przerwa w dostawie wody (Krowica Sama, os. Wolności, Krowica Hołodowska od numeru 123 do numeru 172 oraz Budomierz)",
   "text": "Zakład Usług Komunalnych Sp. z o.o. w Mokrzycy informuje, że w dniu 14.05.2026 (czwartek) w godz. od 8:00 do godz. 15:00 nastąpi przerwa w dostawie wody dla mieszkańców miejscowości Krowica Sama, os. Wolności, Krowica Hołodowska od numeru 123 do numeru 172 oraz Budomierz . Powyższa przerwa spowodowana jest koniecznością wykonania niezbędnych prac remontowych na sieci wodociągowej.\\nZa utrudnienia przepraszamy.\\nPrezes ZUK Sp. z o.o.",
   "model_output": {
    "post_type": "water_outage",
    "quality_status": null,
    "is_past": false,
    "items": [
     {
      "date": "2026-05-14",
      "start": "08:00",
      "end": "15:00",
      "locality": "Krowica Sama",
      "locality_verbatim": "Krowica Sama",
      "street": "Osiedle Wolności",
      "street_verbatim": "os. Wolności",
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-05-14",
      "start": "08:00",
      "end": "15:00",
      "locality": "Krowica Hołodowska",
      "locality_verbatim": "Krowica Hołodowska",
      "street": null,
      "street_verbatim": null,
      "note": "od numeru 123 do numeru 172",
      "kind": "planned"
     },
     {
      "date": "2026-05-14",
      "start": "08:00",
      "end": "15:00",
      "locality": "Budomierz",
      "locality_verbatim": "Budomierz",
      "street": null,
      "street_verbatim": null,
      "note": null,
      "kind": "planned"
     }
    ]
   },
   "expected": [
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-05-14",
      "localityId": "0606180",
      "locality": "Krowica Sama",
      "streetId": "0606180-51473",
      "street": "Osiedle Wolności",
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-05-14",
      "localityId": "0606122",
      "locality": "Krowica Hołodowska",
      "streetId": null,
      "street": null,
      "note": "od numeru 123 do numeru 172"
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-05-14",
      "localityId": "0605996",
      "locality": "Budomierz",
      "streetId": null,
      "street": null,
      "note": null
     }
    }
   ]
  },
  {
   "id": 32457,
   "link": "https://www.gminalubaczow.pl/2025/06/10/przerwa-w-dostawie-wody-10-06-2025-r-tymce-oraz-czesci-miejscowosci-zaluze-od-numeru-263-wygon-i-nowe-siolo/",
   "published": "2025-06-10T08:46:54",
   "title": "Przerwa w dostawie wody 10.06.2025 r. (Tymce oraz części miejscowości Załuże od numeru 263 (Wygon) i Nowe Sioło)",
   "text": "Zakład Usług Komunalnych Sp. z o.o. w Mokrzycy informuje, że w dniu 10.06.2025 (wtorek) w godz. od 8:00 do 17:00 nastąpi przerwa w dostawie wody dla mieszkańców miejscowości Tymce oraz części miejscowości Załuże od numeru 263 (Wygon) i Nowe Sioło . Powyższa przerwa spowodowana jest pracami związanymi z usuwaniem awarii na sieci.\\nZa utrudnienia przepraszamy.\\nZa utrudnienia przepraszamy.\\nPrezes ZUK Sp. z o.o.",
   "model_output": {
    "post_type": "water_outage",
    "quality_status": null,
    "is_past": false,
    "items": [
     {
      "date": "2025-06-10",
      "start": "08:00",
      "end": "17:00",
      "locality": "Tymce",
      "locality_verbatim": "Tymce",
      "street": null,
      "street_verbatim": null,
      "note": null,
      "kind": "emergency"
     },
     {
      "date": "2025-06-10",
      "start": "08:00",
      "end": "17:00",
      "locality": "Załuże",
      "locality_verbatim": "Załuże",
      "street": null,
      "street_verbatim": null,
      "note": "od numeru 263 (Wygon)",
      "kind": "emergency"
     }
    ]
   },
   "expected": [
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2025-06-10",
      "localityId": "0606435",
      "locality": "Tymce",
      "streetId": null,
      "street": null,
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2025-06-10",
      "localityId": "0606464",
      "locality": "Załuże",
      "streetId": null,
      "street": null,
      "note": "od numeru 263 (Wygon)"
     }
    }
   ]
  },
  {
   "id": 39885,
   "link": "https://www.gminalubaczow.pl/2026/10/23/przerwy-w-dostawie-wody-26-29-10-2026/",
   "published": "2026-10-23T18:59:43",
   "title": "Przerwy w dostawie wody: 26-29.10.2026",
   "text": "Zakład Usług Komunalnych Sp. z o. o. w Mokrzycy informuje, że w związku z trwającymi pracami modernizacyjnymi (wymiana węzłów i hydrantów) w dniach od 26.10.2026r. (poniedziałek) do 29.10.2026r. (czwartek) nastąpi przerwa w dostawie wody dla mieszkańców miejscowości:\\n-26.10.2026 (poniedziałek): Lisie Jamy w godz. od 8:00 do 16:00\\n-27.10.2026 (wtorek): Dąbków, Lubaczów ul. Żuki, Opaka od numeru 104 do 110 w godz. od 8:00 do 16:00\\n-28.10.2026 (środa): Załuże–Podłęże od numeru 44 do numeru 92, Bałaje, ul. Przemysłowa (Lubaczów), Antoniki, Młodów ul. Pilipy, Piastowo, Basznia Dolna, Basznia Górna, Podlesie – w godz. od 8:00 do 16:00\\n-29.10.2026 (czwartek): Wólka Krowicka, Lisie Jamy – w godz. od 8:00 do 16:00\\nInformujemy, że po ponownym uruchomieniu wodociągu może nastąpić czasowe pogorszenie jakości wody.\\nZa utrudnienia przepraszamy.\\nPrezes ZUK. Sp. z o. o.",
   "model_output": {
    "post_type": "water_outage",
    "quality_status": null,
    "is_past": false,
    "items": [
     {
      "date": "2026-10-26",
      "start": "08:00",
      "end": "16:00",
      "locality": "Lisie Jamy",
      "locality_verbatim": "Lisie Jamy",
      "street": null,
      "street_verbatim": null,
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-10-27",
      "start": "08:00",
      "end": "16:00",
      "locality": "Dąbków",
      "locality_verbatim": "Dąbków",
      "street": null,
      "street_verbatim": null,
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-10-27",
      "start": "08:00",
      "end": "16:00",
      "locality": "Lubaczów",
      "locality_verbatim": "Lubaczów",
      "street": "Żuki",
      "street_verbatim": "ul. Żuki",
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-10-27",
      "start": "08:00",
      "end": "16:00",
      "locality": "Opaka",
      "locality_verbatim": "Opaka",
      "street": null,
      "street_verbatim": null,
      "note": "od numeru 104 do 110",
      "kind": "planned"
     },
     {
      "date": "2026-10-28",
      "start": "08:00",
      "end": "16:00",
      "locality": "Załuże",
      "locality_verbatim": "Załuże",
      "street": null,
      "street_verbatim": null,
      "note": "Podłęże od numeru 44 do numeru 92",
      "kind": "planned"
     },
     {
      "date": "2026-10-28",
      "start": "08:00",
      "end": "16:00",
      "locality": "Bałaje",
      "locality_verbatim": "Bałaje",
      "street": null,
      "street_verbatim": null,
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-10-28",
      "start": "08:00",
      "end": "16:00",
      "locality": "Lubaczów",
      "locality_verbatim": "Lubaczów",
      "street": "Przemysłowa",
      "street_verbatim": "ul. Przemysłowa",
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-10-28",
      "start": "08:00",
      "end": "16:00",
      "locality": "Antoniki",
      "locality_verbatim": "Antoniki",
      "street": null,
      "street_verbatim": null,
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-10-28",
      "start": "08:00",
      "end": "16:00",
      "locality": "Młodów",
      "locality_verbatim": "Młodów",
      "street": "Pilipy",
      "street_verbatim": "ul. Pilipy",
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-10-28",
      "start": "08:00",
      "end": "16:00",
      "locality": "Piastowo",
      "locality_verbatim": "Piastowo",
      "street": null,
      "street_verbatim": null,
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-10-28",
      "start": "08:00",
      "end": "16:00",
      "locality": "Basznia Dolna",
      "locality_verbatim": "Basznia Dolna",
      "street": null,
      "street_verbatim": null,
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-10-28",
      "start": "08:00",
      "end": "16:00",
      "locality": "Basznia Górna",
      "locality_verbatim": "Basznia Górna",
      "street": null,
      "street_verbatim": null,
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-10-28",
      "start": "08:00",
      "end": "16:00",
      "locality": "Podlesie",
      "locality_verbatim": "Podlesie",
      "street": null,
      "street_verbatim": null,
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-10-29",
      "start": "08:00",
      "end": "16:00",
      "locality": "Wólka Krowicka",
      "locality_verbatim": "Wólka Krowicka",
      "street": null,
      "street_verbatim": null,
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-10-29",
      "start": "08:00",
      "end": "16:00",
      "locality": "Lisie Jamy",
      "locality_verbatim": "Lisie Jamy",
      "street": null,
      "street_verbatim": null,
      "note": null,
      "kind": "planned"
     }
    ]
   },
   "expected": [
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-10-26",
      "localityId": "0606234",
      "locality": "Lisie Jamy",
      "streetId": null,
      "street": null,
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-10-27",
      "localityId": "0606004",
      "locality": "Dąbków",
      "streetId": null,
      "street": null,
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-10-27",
      "localityId": "0972447",
      "locality": "Lubaczów",
      "streetId": "0972447-26555",
      "street": "Żuki",
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-10-27",
      "localityId": "0606317",
      "locality": "Opaka",
      "streetId": null,
      "street": null,
      "note": "od numeru 104 do 110"
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-10-28",
      "localityId": "0606464",
      "locality": "Załuże",
      "streetId": null,
      "street": null,
      "note": "Podłęże od numeru 44 do numeru 92"
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-10-28",
      "localityId": "0605878",
      "locality": "Bałaje",
      "streetId": null,
      "street": null,
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-10-28",
      "localityId": "0972447",
      "locality": "Lubaczów",
      "streetId": "0972447-17742",
      "street": "Przemysłowa",
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-10-28",
      "localityId": "0606292",
      "locality": "Antoniki",
      "streetId": null,
      "street": null,
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-10-28",
      "localityId": "0606286",
      "locality": "Młodów",
      "streetId": "0606286-39507",
      "street": "Pilipy",
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-10-28",
      "localityId": "0606352",
      "locality": "Piastowo",
      "streetId": null,
      "street": null,
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-10-28",
      "localityId": "0605890",
      "locality": "Basznia Dolna",
      "streetId": null,
      "street": null,
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-10-28",
      "localityId": "0605950",
      "locality": "Basznia Górna",
      "streetId": null,
      "street": null,
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-10-28",
      "localityId": "0606369",
      "locality": "Podlesie",
      "streetId": null,
      "street": null,
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-10-29",
      "localityId": "0606441",
      "locality": "Wólka Krowicka",
      "streetId": null,
      "street": null,
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-10-29",
      "localityId": "0606234",
      "locality": "Lisie Jamy",
      "streetId": null,
      "street": null,
      "note": null
     }
    }
   ]
  },
  {
   "id": 39133,
   "link": "https://www.gminalubaczow.pl/2026/09/09/przerwa-w-dostawie-wody-10-09-2026-mlodow-warszawska-blonie-sloneczna-sasiedzka-piaskowa-rzeczna-wodna-lesna-kosciuszki-od-nr-22-do-nr-80-karolowka-sobieskiego-od-nr-27-do-nr-47/",
   "published": "2026-09-09T14:35:47",
   "title": "Przerwa w dostawie wody – 10.09.2026 – Młodów (Warszawska, Błonie, Słoneczna, Sąsiedzka, Piaskowa, Rzeczna, Wodna, Leśna, Kościuszki od nr 22 do nr 80), Karolówka (Sobieskiego od nr 27 do nr 47)",
   "text": "Zakład Usług Komunalnych Sp. z o. o. w Mokrzycy informuje, że w dniu 10.09.2026r.(czwartek) w godz. od 8:00 do godz. 16:00 nastąpi przerwa w dostawie wody dla mieszkańców miejscowości: Młodów ulice: Warszawska, Błonie, Słoneczna, Sąsiedzka, Piaskowa, Rzeczna, Wodna, Leśna, Kościuszki od nr 22 do nr 80 oraz Karolówka ulica Sobieskiego od nr 27 do nr 47.\\nPowyższa przerwa wynika z konieczności przeprowadzenia prac modernizacyjnych (wymiana węzłów i hydrantów).\\nInformujemy, że po ponownym uruchomieniu wodociągu może nastąpić czasowe pogorszenie jakości wody.\\nZa utrudnienia przepraszamy.\\nPrezes ZUK. Sp. z o. o.",
   "model_output": {
    "post_type": "water_outage",
    "quality_status": null,
    "is_past": false,
    "items": [
     {
      "date": "2026-09-10",
      "start": "08:00",
      "end": "16:00",
      "locality": "Młodów",
      "locality_verbatim": "Młodów",
      "street": "Warszawska",
      "street_verbatim": "Warszawska",
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-09-10",
      "start": "08:00",
      "end": "16:00",
      "locality": "Młodów",
      "locality_verbatim": "Młodów",
      "street": "Błonie",
      "street_verbatim": "Błonie",
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-09-10",
      "start": "08:00",
      "end": "16:00",
      "locality": "Młodów",
      "locality_verbatim": "Młodów",
      "street": "Słoneczna",
      "street_verbatim": "Słoneczna",
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-09-10",
      "start": "08:00",
      "end": "16:00",
      "locality": "Młodów",
      "locality_verbatim": "Młodów",
      "street": "Sąsiedzka",
      "street_verbatim": "Sąsiedzka",
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-09-10",
      "start": "08:00",
      "end": "16:00",
      "locality": "Młodów",
      "locality_verbatim": "Młodów",
      "street": "Piaskowa",
      "street_verbatim": "Piaskowa",
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-09-10",
      "start": "08:00",
      "end": "16:00",
      "locality": "Młodów",
      "locality_verbatim": "Młodów",
      "street": "Rzeczna",
      "street_verbatim": "Rzeczna",
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-09-10",
      "start": "08:00",
      "end": "16:00",
      "locality": "Młodów",
      "locality_verbatim": "Młodów",
      "street": "Wodna",
      "street_verbatim": "Wodna",
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-09-10",
      "start": "08:00",
      "end": "16:00",
      "locality": "Młodów",
      "locality_verbatim": "Młodów",
      "street": "Leśna",
      "street_verbatim": "Leśna",
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-09-10",
      "start": "08:00",
      "end": "16:00",
      "locality": "Młodów",
      "locality_verbatim": "Młodów",
      "street": "Tadeusza Kościuszki",
      "street_verbatim": "Kościuszki",
      "note": "od nr 22 do nr 80",
      "kind": "planned"
     },
     {
      "date": "2026-09-10",
      "start": "08:00",
      "end": "16:00",
      "locality": "Karolówka",
      "locality_verbatim": "Karolówka",
      "street": "Jana III Sobieskiego",
      "street_verbatim": "ulica Sobieskiego",
      "note": "od nr 27 do nr 47",
      "kind": "planned"
     }
    ]
   },
   "expected": [
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-09-10",
      "localityId": "0606286",
      "locality": "Młodów",
      "streetId": "0606286-23682",
      "street": "Warszawska",
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-09-10",
      "localityId": "0606286",
      "locality": "Młodów",
      "streetId": "0606286-01465",
      "street": "Błonie",
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-09-10",
      "localityId": "0606286",
      "locality": "Młodów",
      "streetId": "0606286-20254",
      "street": "Słoneczna",
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-09-10",
      "localityId": "0606286",
      "locality": "Młodów",
      "streetId": "0606286-19585",
      "street": "Sąsiedzka",
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-09-10",
      "localityId": "0606286",
      "locality": "Młodów",
      "streetId": "0606286-16033",
      "street": "Piaskowa",
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-09-10",
      "localityId": "0606286",
      "locality": "Młodów",
      "streetId": "0606286-19326",
      "street": "Rzeczna",
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-09-10",
      "localityId": "0606286",
      "locality": "Młodów",
      "streetId": "0606286-24550",
      "street": "Wodna",
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-09-10",
      "localityId": "0606286",
      "locality": "Młodów",
      "streetId": "0606286-10898",
      "street": "Leśna",
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-09-10",
      "localityId": "0606286",
      "locality": "Młodów",
      "streetId": "0606286-09582",
      "street": "Tadeusza Kościuszki",
      "note": "od nr 22 do nr 80"
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-09-10",
      "localityId": "0606116",
      "locality": "Karolówka",
      "streetId": "0606116-20431",
      "street": "Jana III Sobieskiego",
      "note": "od nr 27 do nr 47"
     }
    }
   ]
  },
  {
   "id": 39368,
   "link": "https://www.gminalubaczow.pl/2026/09/18/przerwa-w-dostawie-wody-21-09-2026-lisie-jamy-ul-lwowska-wspolna-sportowa-krotka-cicha-wesola-nadrzeczna-smolince-nowa-spokojna-parkowa-ogrodowa/",
   "published": "2026-09-18T14:05:06",
   "title": "Przerwa w dostawie wody – 21.09.2026 – Lisie Jamy ul. Lwowska, Wspólna, Sportowa, Krótka, Cicha, Wesoła, Nadrzeczna, Smolińce, Nowa, Spokojna, Parkowa, Ogrodowa",
   "text": "Zakład Usług Komunalnych Sp. z o. o. w Mokrzycy informuje, że w dniu 21.09.2026r. (poniedziałek) w godz. od 8:00 do godz. 16:00 nastąpi przerwa w dostawie wody dla mieszkańców miejscowości: Lisie Jamy: ul. Lwowska, Wspólna, Sportowa, Krótka, Cicha, Wesoła, Nadrzeczna, Smolińce, Nowa, Spokojna, Parkowa, Ogrodowa.\\nPowyższa przerwa wynika z konieczności przeprowadzenia prac modernizacyjnych (wymiana węzłów i hydrantów).\\nInformujemy, że po ponownym uruchomieniu wodociągu może nastąpić czasowe pogorszenie jakości wody.\\nZa utrudnienia przepraszamy.\\nPrezes ZUK. Sp. z o. o.",
   "model_output": {
    "post_type": "water_outage",
    "quality_status": null,
    "is_past": false,
    "items": [
     {
      "date": "2026-09-21",
      "start": "08:00",
      "end": "16:00",
      "locality": "Lisie Jamy",
      "locality_verbatim": "Lisie Jamy",
      "street": "Lwowska",
      "street_verbatim": "ul. Lwowska",
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-09-21",
      "start": "08:00",
      "end": "16:00",
      "locality": "Lisie Jamy",
      "locality_verbatim": "Lisie Jamy",
      "street": "Wspólna",
      "street_verbatim": "Wspólna",
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-09-21",
      "start": "08:00",
      "end": "16:00",
      "locality": "Lisie Jamy",
      "locality_verbatim": "Lisie Jamy",
      "street": "Sportowa",
      "street_verbatim": "Sportowa",
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-09-21",
      "start": "08:00",
      "end": "16:00",
      "locality": "Lisie Jamy",
      "locality_verbatim": "Lisie Jamy",
      "street": "Krótka",
      "street_verbatim": "Krótka",
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-09-21",
      "start": "08:00",
      "end": "16:00",
      "locality": "Lisie Jamy",
      "locality_verbatim": "Lisie Jamy",
      "street": "Cicha",
      "street_verbatim": "Cicha",
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-09-21",
      "start": "08:00",
      "end": "16:00",
      "locality": "Lisie Jamy",
      "locality_verbatim": "Lisie Jamy",
      "street": "Wesoła",
      "street_verbatim": "Wesoła",
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-09-21",
      "start": "08:00",
      "end": "16:00",
      "locality": "Lisie Jamy",
      "locality_verbatim": "Lisie Jamy",
      "street": "Nadrzeczna",
      "street_verbatim": "Nadrzeczna",
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-09-21",
      "start": "08:00",
      "end": "16:00",
      "locality": "Lisie Jamy",
      "locality_verbatim": "Lisie Jamy",
      "street": "Smolińce",
      "street_verbatim": "Smolińce",
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-09-21",
      "start": "08:00",
      "end": "16:00",
      "locality": "Lisie Jamy",
      "locality_verbatim": "Lisie Jamy",
      "street": "Nowa",
      "street_verbatim": "Nowa",
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-09-21",
      "start": "08:00",
      "end": "16:00",
      "locality": "Lisie Jamy",
      "locality_verbatim": "Lisie Jamy",
      "street": "Spokojna",
      "street_verbatim": "Spokojna",
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-09-21",
      "start": "08:00",
      "end": "16:00",
      "locality": "Lisie Jamy",
      "locality_verbatim": "Lisie Jamy",
      "street": "Parkowa",
      "street_verbatim": "Parkowa",
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-09-21",
      "start": "08:00",
      "end": "16:00",
      "locality": "Lisie Jamy",
      "locality_verbatim": "Lisie Jamy",
      "street": "Ogrodowa",
      "street_verbatim": "Ogrodowa",
      "note": null,
      "kind": "planned"
     }
    ]
   },
   "expected": [
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-09-21",
      "localityId": "0606234",
      "locality": "Lisie Jamy",
      "streetId": "0606234-11467",
      "street": "Lwowska",
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-09-21",
      "localityId": "0606234",
      "locality": "Lisie Jamy",
      "streetId": "0606234-24885",
      "street": "Wspólna",
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-09-21",
      "localityId": "0606234",
      "locality": "Lisie Jamy",
      "streetId": "0606234-20683",
      "street": "Sportowa",
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-09-21",
      "localityId": "0606234",
      "locality": "Lisie Jamy",
      "streetId": "0606234-10009",
      "street": "Krótka",
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-09-21",
      "localityId": "0606234",
      "locality": "Lisie Jamy",
      "streetId": "0606234-02974",
      "street": "Cicha",
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-09-21",
      "localityId": "0606234",
      "locality": "Lisie Jamy",
      "streetId": "0606234-23884",
      "street": "Wesoła",
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-09-21",
      "localityId": "0606234",
      "locality": "Lisie Jamy",
      "streetId": "0606234-13902",
      "street": "Nadrzeczna",
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-09-21",
      "localityId": "0606234",
      "locality": "Lisie Jamy",
      "streetId": "0606234-27260",
      "street": "Smolińce",
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-09-21",
      "localityId": "0606234",
      "locality": "Lisie Jamy",
      "streetId": "0606234-14330",
      "street": "Nowa",
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-09-21",
      "localityId": "0606234",
      "locality": "Lisie Jamy",
      "streetId": "0606234-20677",
      "street": "Spokojna",
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-09-21",
      "localityId": "0606234",
      "locality": "Lisie Jamy",
      "streetId": "0606234-15710",
      "street": "Parkowa",
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-09-21",
      "localityId": "0606234",
      "locality": "Lisie Jamy",
      "streetId": "0606234-14834",
      "street": "Ogrodowa",
      "note": null
     }
    }
   ]
  },
  {
   "id": 39304,
   "link": "https://www.gminalubaczow.pl/2026/09/14/przerwa-w-dostawie-wody-15-09-2026-mlodow-ul-lesna-warszawska-rzeczna-wodna-blonie-sasiedzka-sloneczna-piaskowa-krotka-karolowka-ul-sobieskiego-od-nr-27-do-nr-47/",
   "published": "2026-09-14T13:54:00",
   "title": "Przerwa w dostawie wody – 15.09.2026 – Młodów: ul. Leśna, Warszawska, Rzeczna, Wodna, Błonie, Sąsiedzka, Słoneczna, Piaskowa, Krótka, Karolówka: ul. Sobieskiego od nr 27 do nr 47",
   "text": "Zakład Usług Komunalnych Sp. z o. o. w Mokrzycy informuje, że w dniu 15.09.2026r.(wtorek) w godz. od 8:00 do godz. 16:00 nastąpi przerwa w dostawie wody dla mieszkańców miejscowości: Młodów, ul. Leśna, Warszawska, Rzeczna, Wodna, Błonie, Sąsiedzka, Słoneczna, Piaskowa, Krótka, Karolówka, ul. Sobieskiego od nr 27 do nr 47.\\nPowyższa przerwa wynika z konieczności przeprowadzenia prac modernizacyjnych (wymiana węzłów i hydrantów).\\nInformujemy, że po ponownym uruchomieniu wodociągu może nastąpić czasowe pogorszenie jakości wody.\\nZa utrudnienia przepraszamy.\\nPrezes ZUK. Sp. z o. o.",
   "model_output": {
    "post_type": "water_outage",
    "quality_status": null,
    "is_past": false,
    "items": [
     {
      "date": "2026-09-15",
      "start": "08:00",
      "end": "16:00",
      "locality": "Młodów",
      "locality_verbatim": "Młodów",
      "street": "Leśna",
      "street_verbatim": "ul. Leśna",
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-09-15",
      "start": "08:00",
      "end": "16:00",
      "locality": "Młodów",
      "locality_verbatim": "Młodów",
      "street": "Warszawska",
      "street_verbatim": "Warszawska",
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-09-15",
      "start": "08:00",
      "end": "16:00",
      "locality": "Młodów",
      "locality_verbatim": "Młodów",
      "street": "Rzeczna",
      "street_verbatim": "Rzeczna",
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-09-15",
      "start": "08:00",
      "end": "16:00",
      "locality": "Młodów",
      "locality_verbatim": "Młodów",
      "street": "Wodna",
      "street_verbatim": "Wodna",
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-09-15",
      "start": "08:00",
      "end": "16:00",
      "locality": "Młodów",
      "locality_verbatim": "Młodów",
      "street": "Błonie",
      "street_verbatim": "Błonie",
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-09-15",
      "start": "08:00",
      "end": "16:00",
      "locality": "Młodów",
      "locality_verbatim": "Młodów",
      "street": "Sąsiedzka",
      "street_verbatim": "Sąsiedzka",
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-09-15",
      "start": "08:00",
      "end": "16:00",
      "locality": "Młodów",
      "locality_verbatim": "Młodów",
      "street": "Słoneczna",
      "street_verbatim": "Słoneczna",
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-09-15",
      "start": "08:00",
      "end": "16:00",
      "locality": "Młodów",
      "locality_verbatim": "Młodów",
      "street": "Piaskowa",
      "street_verbatim": "Piaskowa",
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-09-15",
      "start": "08:00",
      "end": "16:00",
      "locality": "Młodów",
      "locality_verbatim": "Młodów",
      "street": "Krótka",
      "street_verbatim": "Krótka",
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2026-09-15",
      "start": "08:00",
      "end": "16:00",
      "locality": "Karolówka",
      "locality_verbatim": "Karolówka",
      "street": "Jana III Sobieskiego",
      "street_verbatim": "ul. Sobieskiego",
      "note": "od nr 27 do nr 47",
      "kind": "planned"
     }
    ]
   },
   "expected": [
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-09-15",
      "localityId": "0606286",
      "locality": "Młodów",
      "streetId": "0606286-10898",
      "street": "Leśna",
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-09-15",
      "localityId": "0606286",
      "locality": "Młodów",
      "streetId": "0606286-23682",
      "street": "Warszawska",
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-09-15",
      "localityId": "0606286",
      "locality": "Młodów",
      "streetId": "0606286-19326",
      "street": "Rzeczna",
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-09-15",
      "localityId": "0606286",
      "locality": "Młodów",
      "streetId": "0606286-24550",
      "street": "Wodna",
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-09-15",
      "localityId": "0606286",
      "locality": "Młodów",
      "streetId": "0606286-01465",
      "street": "Błonie",
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-09-15",
      "localityId": "0606286",
      "locality": "Młodów",
      "streetId": "0606286-19585",
      "street": "Sąsiedzka",
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-09-15",
      "localityId": "0606286",
      "locality": "Młodów",
      "streetId": "0606286-20254",
      "street": "Słoneczna",
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-09-15",
      "localityId": "0606286",
      "locality": "Młodów",
      "streetId": "0606286-16033",
      "street": "Piaskowa",
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-09-15",
      "localityId": "0606286",
      "locality": "Młodów",
      "streetId": "0606286-10009",
      "street": "Krótka",
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-09-15",
      "localityId": "0606116",
      "locality": "Karolówka",
      "streetId": "0606116-20431",
      "street": "Jana III Sobieskiego",
      "note": "od nr 27 do nr 47"
     }
    }
   ]
  },
  {
   "id": 39455,
   "link": "https://www.gminalubaczow.pl/2026/09/23/uwaga-brak-przydatnosci-wody-do-spozycia-wody-z-wodociagu-w-hucie-krysztalowej/",
   "published": "2026-09-23T12:51:21",
   "title": "Uwaga! Brak przydatności wody do spożycia wody z wodociągu w Hucie Kryształowej",
   "text": "Zakład Usług Komunalnych Sp. z o.o. w Mokrzycy informuje, że w wodzie z wodociągu w miejscowości Huta Kryształowa, Państwowy Powiatowy Inspektor Sanitarny w Lubaczowie stwierdził w dniu 23.09.2026r. zanieczyszczenie mikrobiologiczne tj. obecność bakterii grupy coli oraz brak przydatności tej wody do spożycia.\\nW związku z powyższym przygotowano zastępczy punkt poboru wody zdatnej do spożycia.\\nPrezes Zarządu Zakładu Usług Komunalnych Sp. z o.o\\nKOMUNIKAT PAŃSTWOWEGO POWIATOWEGO INSPEKTORA SANITARNEGO W LUBACZOWIE o braku przydatności wody przeznaczonej do spożycia przez ludzi z wodociągu w Hucie Kryształowej, zaopatrującego w wodę miejscowość: Huta Kryształowa",
   "model_output": {
    "post_type": "water_quality",
    "quality_status": "warning",
    "is_past": false,
    "items": [
     {
      "date": "2026-09-23",
      "start": null,
      "end": null,
      "locality": "Huta Kryształowa",
      "locality_verbatim": "Huta Kryształowa",
      "street": null,
      "street_verbatim": null,
      "note": null,
      "kind": "quality"
     }
    ]
   },
   "expected": [
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-09-23",
      "localityId": "0606100",
      "locality": "Huta Kryształowa",
      "streetId": null,
      "street": null,
      "note": null
     }
    }
   ]
  },
  {
   "id": 39480,
   "link": "https://www.gminalubaczow.pl/2026/09/25/oda-z-wodociagu-w-hucie-krysztalowej-jest-przydatna-do-spozycia-przez-ludzi/",
   "published": "2026-09-25T14:05:06",
   "title": "Woda z wodociągu w Hucie Kryształowej jest przydatna do spożycia przez ludzi",
   "text": "Zakład Usług Komunalnych Sp. z o.o. w Mokrzycy informuje że, Państwowy Powiatowy Inspektor Sanitarny w Lubaczowie w dniu 25.09.2026r. stwierdził że, woda z wodociągu w Hucie Kryształowej jest przydatna do spożycia przez ludzi.\\nPrezes Zarządu\\nZakładu Usług Komunalnych Sp. z o.o\\nKomunikat Państwowego Powiatowego Inspektora Sanitarnego w Lubaczowie w sprawie przywrócenia wartości parametrycznej mikrobiologicznego parametru wskaźnikowego bakterii grupy coli w wodzie przeznaczonej do spożycia przez ludzi z wodociągu w Hucie Kryształowej, zaopatrującego w wodę miejscowość Huta Kryształowa /plik pdf/",
   "model_output": {
    "post_type": "water_quality",
    "quality_status": "lifted",
    "is_past": false,
    "items": [
     {
      "date": "2026-09-25",
      "start": null,
      "end": null,
      "locality": "Huta Kryształowa",
      "locality_verbatim": "Huta Kryształowa",
      "street": null,
      "street_verbatim": null,
      "note": null,
      "kind": "quality"
     }
    ]
   },
   "expected": [
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2026-09-25",
      "localityId": "0606100",
      "locality": "Huta Kryształowa",
      "streetId": null,
      "street": null,
      "note": null
     }
    }
   ]
  },
  {
   "id": 31750,
   "link": "https://www.gminalubaczow.pl/2025/04/29/majowka-pod-bialo-czerwona-swietujmy-razem/",
   "published": "2025-04-29T14:51:45",
   "title": "Majówka pod biało-czerwoną – świętujmy razem!",
   "text": "Zbliża się wyjątkowy czas – majowe święta, które są nie tylko okazją do odpoczynku, ale także momentem dumy z naszej historii i narodowej tożsamości. Zachęcamy wszystkich mieszkańców, aby na długi majowy weekend wywiesili biało-czerwone flagi i wspólnie uczcili te ważne dla Polski dni.\\n1 maja obchodzimy Święto Pracy oraz 21 rocznicę członkostwa Polski w Unii Europejskiej . 2 maja przypada Dzień Flagi Rzeczypospolitej Polskiej – symbolu naszej przynależności i wspólnoty narodowej. 3 maja natomiast celebrujemy uchwalenie Konstytucji 3 Maja – pierwszej w Europie i drugiej na świecie nowoczesnej konstytucji.\\nBiało-czerwona flaga, oparta na historycznych barwach Królestwa Polskiego i Wielkiego Księstwa Litewskiego, to więcej niż tylko znak – to wyraz naszej dumy, naszej historii i wspólnych wartości.\\nPamiętajmy o zasadach godnego eksponowania flagi:\\n-Flaga musi być czysta i w dobrym stanie.\\n-Nie może być pomięta, postrzępiona ani zabrudzona.\\n-Zawsze ma pierwszeństwo przed innymi flagami.\\n-W razie burzy, silnego wiatru lub śnieżycy należy ją zdjąć.\\n-Flaga nie powinna dotykać ziemi, wody czy bruku.\\n-Na fladze nie umieszczamy żadnych napisów ani symboli.\\nZużytą flagę należy zniszczyć w sposób godny – najlepiej poprzez oddzielenie barw.\\nPokażmy naszą dumę! Wywieśmy flagi na naszych domach, balkonach i ogrodach. Niech majowe dni będą czasem radości, refleksji i narodowej jedności.",
   "model_output": {
    "post_type": "other",
    "quality_status": null,
    "is_past": false,
    "items": []
   },
   "expected": []
  },
  {
   "id": 39321,
   "link": "https://www.gminalubaczow.pl/2026/09/16/xxxiv-sesja-rady-gminy-lubaczow-w-kadencji-2024-2029-11-09-2026-r/",
   "published": "2026-09-16T08:38:19",
   "title": "XXXIV sesja Rady Gminy Lubaczów w kadencji 2024-2029 – 11.09.2026 r.",
   "text": "Nagranie XXXIV sesji Rady Gminy Lubaczów w kadencji 2024-2029 z 11.09.2026 r.\\n﻿ >",
   "model_output": {
    "post_type": "other",
    "quality_status": null,
    "is_past": false,
    "items": []
   },
   "expected": []
  },
  {
   "id": 38675,
   "link": "https://www.gminalubaczow.pl/2026/08/04/uwaga-na-upaly/",
   "published": "2026-08-04T11:22:05",
   "title": "Uwaga na upały!",
   "text": "Utrzymujące się upały stanowią poważne zagrożenie dla zdrowia i życia, zwiększając ryzyko odwodnienia, przegrzania organizmu oraz udaru cieplnego. Szczególną ostrożność powinny zachować dzieci, seniorzy, kobiety w ciąży i osoby przewlekle chore.\\nJak chronić się przed upałem?\\nNawadniaj organizm\\n-Pij regularnie duże ilości wody – nie czekaj na uczucie pragnienia.\\n-W czasie intensywnego pocenia się uzupełniaj elektrolity i minerały.\\n-Unikaj alkoholu, który sprzyja odwodnieniu i zaburza proces termoregulacji.\\nOgranicz przebywanie na słońcu\\n-Unikaj wychodzenia na zewnątrz w najgorętszych godzinach dnia, szczególnie między 11.00 a 18.00.\\n-Jeśli musisz przebywać na świeżym powietrzu, szukaj zacienionych miejsc.\\n-Noś lekką, przewiewną odzież w jasnych kolorach oraz nakrycie głowy.\\n-Stosuj kremy z filtrem UV, aby chronić skórę przed szkodliwym promieniowaniem słonecznym.\\n-Ogranicz intensywny wysiłek fizyczny i treningi w godzinach największego nasłonecznienia.\\nDbaj o odpowiednią temperaturę w domu\\n-W ciągu dnia zasłaniaj okna, rolety lub żaluzje, aby ograniczyć nagrzewanie pomieszczeń.\\n-Wietrz mieszkanie rano i wieczorem, gdy temperatura na zewnątrz jest niższa.\\n-Korzystaj z wentylatorów lub klimatyzacji zgodnie z zaleceniami producenta.\\nSzczególna troska o dzieci, seniorów i zwierzęta\\n-Pod żadnym pozorem nie pozostawiaj dzieci, osób starszych ani zwierząt w zaparkowanym samochodzie, nawet na krótką chwilę. Wnętrze pojazdu nagrzewa się bardzo szybko, a panująca w nim temperatura może doprowadzić do przegrzania organizmu i bezpośredniego zagrożenia życia.\\n-Regularnie sprawdzaj samopoczucie starszych członków rodziny i sąsiadów. Seniorzy często słabiej odczuwają pragnienie i są bardziej narażeni na skutki upałów.\\n-Zapewnij zwierzętom stały dostęp do świeżej i chłodnej wody.\\nObjawy przegrzania organizmu\\nNależy zwrócić szczególną uwagę na następujące symptomy:\\n-silny ból i zawroty głowy,\\n-osłabienie i zmęczenie,\\n-nudności lub wymioty,\\n-podwyższona temperatura ciała,\\n-przyspieszone tętno i oddech,\\n-nadmierne pragnienie,\\n-zaburzenia świadomości, dezorientacja lub utrata przytomności.\\nW przypadku wystąpienia niepokojących objawów należy niezwłocznie przenieść się do chłodnego miejsca, schłodzić organizm i w razie potrzeby wezwać pomoc, dzwoniąc pod numer alarmowy 112 .\\nDodatkowo w przypadku potrzeby uzyskania pomocy lub przekazania informacji o osobie, która może wymagać wsparcia w czasie upałów, można skontaktować się z:\\n-Centrum Usług Społecznych Gminy Lubaczów – tel. 16 632 23 47 oraz 601 215 782 ;\\n-telefonem alarmowym Urzędu Gminy Lubaczów – tel. 507 133 913.\\nProsimy mieszkańców o czujność i zgłaszanie sytuacji, w których szczególnie osoby starsze, samotne, chore lub z niepełnosprawnościami mogą potrzebować pomocy.\\nZadbajmy o siebie i innych. W czasie upałów nawet drobny gest — telefon do znajomego lub podanie komuś wody — może mieć ogromne znaczenie!",
   "model_output": {
    "post_type": "other",
    "quality_status": null,
    "is_past": false,
    "items": []
   },
   "expected": []
  }
 ],
 "negatives_about": "Recorded v3-prompt outputs (older prompt) that the gate must drop item by item: an inflected locality_verbatim not matching the list form (39480 'Hucie Kryształowej') and notes spliced from two pieces of the post (31662, 31782).",
 "negatives": [
  {
   "id": 39480,
   "link": "https://www.gminalubaczow.pl/2026/09/25/oda-z-wodociagu-w-hucie-krysztalowej-jest-przydatna-do-spozycia-przez-ludzi/",
   "published": "2026-09-25T14:05:06",
   "title": "Woda z wodociągu w Hucie Kryształowej jest przydatna do spożycia przez ludzi",
   "text": "Zakład Usług Komunalnych Sp. z o.o. w Mokrzycy informuje że, Państwowy Powiatowy Inspektor Sanitarny w Lubaczowie w dniu 25.09.2026r. stwierdził że, woda z wodociągu w Hucie Kryształowej jest przydatna do spożycia przez ludzi.\\nPrezes Zarządu\\nZakładu Usług Komunalnych Sp. z o.o\\nKomunikat Państwowego Powiatowego Inspektora Sanitarnego w Lubaczowie w sprawie przywrócenia wartości parametrycznej mikrobiologicznego parametru wskaźnikowego bakterii grupy coli w wodzie przeznaczonej do spożycia przez ludzi z wodociągu w Hucie Kryształowej, zaopatrującego w wodę miejscowość Huta Kryształowa /plik pdf/",
   "model_output": {
    "post_type": "water_quality",
    "quality_status": "lifted",
    "is_past": false,
    "items": [
     {
      "date": "2026-09-25",
      "start": null,
      "end": null,
      "locality": "Huta Kryształowa",
      "locality_verbatim": "Hucie Kryształowej",
      "street": null,
      "street_verbatim": null,
      "note": null,
      "kind": "quality"
     }
    ]
   },
   "expected": [
    {
     "kept": false,
     "reason": "locality_verbatim does not match locality"
    }
   ]
  },
  {
   "id": 31662,
   "link": "https://www.gminalubaczow.pl/2025/04/28/przerwa-w-dostawie-wody-tymce-zaluze-od-263-do-344-oraz-nowe-siolo-od-161-do-163/",
   "published": "2025-04-28T09:20:16",
   "title": "Przerwa w dostawie wody (Tymce, Załuże od 263 do 344 oraz Nowe Sioło od 161 do 163)",
   "text": "Zakład Usług Komunalnych Sp. z o.o. w Mokrzycy informuje, że w dniach 29.04.2025 (wtorek) i 30.04.2025 (środa) w godz. od 8:00 do 15:00 nastąpi przerwa w dostawie wody dla mieszkańców miejscowości Tymce oraz części miejscowości Załuże od numeru 263 do numeru 344 i Nowe Sioło od numeru 161 do numeru 163.\\nPowyższa przerwa wynika z konieczności przeprowadzenia prac modernizacyjnych (wymiana węzłów i hydrantów).\\nZa utrudnienia przepraszamy.\\nPrezes ZUK Sp. z o.o.",
   "model_output": {
    "post_type": "water_outage",
    "quality_status": null,
    "is_past": false,
    "items": [
     {
      "date": "2025-04-29",
      "start": "08:00",
      "end": "15:00",
      "locality": "Tymce",
      "locality_verbatim": "Tymce",
      "street": null,
      "street_verbatim": null,
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2025-04-30",
      "start": "08:00",
      "end": "15:00",
      "locality": "Tymce",
      "locality_verbatim": "Tymce",
      "street": null,
      "street_verbatim": null,
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2025-04-29",
      "start": "08:00",
      "end": "15:00",
      "locality": "Załuże",
      "locality_verbatim": "Załuże",
      "street": null,
      "street_verbatim": null,
      "note": "części miejscowości od numeru 263 do numeru 344",
      "kind": "planned"
     },
     {
      "date": "2025-04-30",
      "start": "08:00",
      "end": "15:00",
      "locality": "Załuże",
      "locality_verbatim": "Załuże",
      "street": null,
      "street_verbatim": null,
      "note": "części miejscowości od numeru 263 do numeru 344",
      "kind": "planned"
     }
    ]
   },
   "expected": [
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2025-04-29",
      "localityId": "0606435",
      "locality": "Tymce",
      "streetId": null,
      "street": null,
      "note": null
     }
    },
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2025-04-30",
      "localityId": "0606435",
      "locality": "Tymce",
      "streetId": null,
      "street": null,
      "note": null
     }
    },
    {
     "kept": false,
     "reason": "note not literal"
    },
    {
     "kept": false,
     "reason": "note not literal"
    }
   ]
  },
  {
   "id": 31782,
   "link": "https://www.gminalubaczow.pl/2025/05/05/przerwa-w-dostawie-wody-7-05-2025-r-tymce-zaluze-od-263-do-344-oraz-nowe-siolo-od-161-do-163/",
   "published": "2025-05-05T13:25:27",
   "title": "Przerwa w dostawie wody 7.05.2025 r. (Tymce, Załuże od 263 do 344 oraz Nowe Sioło od 161 do 163)",
   "text": "Zakład Usług Komunalnych Sp. z o.o. w Mokrzycy informuje, że w dniu 7.05.2025 (środa) w godz. od 8:00 do 15:00 nastąpi przerwa w dostawie wody dla mieszkańców miejscowości Tymce oraz części miejscowości Załuże od numeru 263 do numeru 344 i Nowe Sioło od numeru 161 do numeru 163.\\nPowyższa przerwa wynika z konieczności przeprowadzenia prac modernizacyjnych (wymiana węzłów i hydrantów).\\nZa utrudnienia przepraszamy.\\nPrezes ZUK Sp. z o.o.",
   "model_output": {
    "post_type": "water_outage",
    "quality_status": null,
    "is_past": false,
    "items": [
     {
      "date": "2025-05-07",
      "start": "08:00",
      "end": "15:00",
      "locality": "Tymce",
      "locality_verbatim": "Tymce",
      "street": null,
      "street_verbatim": null,
      "note": null,
      "kind": "planned"
     },
     {
      "date": "2025-05-07",
      "start": "08:00",
      "end": "15:00",
      "locality": "Załuże",
      "locality_verbatim": "Załuże",
      "street": null,
      "street_verbatim": null,
      "note": "części miejscowości od numeru 263 do numeru 344",
      "kind": "planned"
     }
    ]
   },
   "expected": [
    {
     "kept": true,
     "reason": null,
     "resolved": {
      "date": "2025-05-07",
      "localityId": "0606435",
      "locality": "Tymce",
      "streetId": null,
      "street": null,
      "note": null
     }
    },
    {
     "kept": false,
     "reason": "note not literal"
    }
   ]
  }
 ]
}`);
