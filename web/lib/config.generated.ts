// Generated from etl/sources.yaml by `npm run config:sync`; do not edit.
// The site's share of the one config: no constant here is written by hand.

/** Footer navigation: live features only; shown once there are 2+ links. */
export const FEATURES: Array<{ section: string; links: Array<{ href: string; text: string }> }> = [
  {
    "section": "Sprawdź przy swojej ulicy",
    "links": [
      {
        "href": "/",
        "text": "Wywóz śmieci"
      }
    ]
  }
];

/** Each gmina's public schedule page by TERYT (never the archive). */
export const GMINA_SCHEDULE_PAGES: Record<string, string> = {
  "1809011": "https://czystylubaczow.info/odbior-odpadow/harmonogram-odbioru-odpadow/",
  "1809042": "https://www.gminalubaczow.pl/2026/01/02/harmonogram-odbioru-odpadow-komunalnych-na-rok-2026/"
};
