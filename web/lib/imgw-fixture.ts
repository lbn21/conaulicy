// IMGW meteo warning fixtures for the unit tests and the dev mock
// (lib/imgw-mock.ts). A fixture, so code (scripts/check-tracked-data.mjs).
// Format: docs/data/imgw.md.

/**
 * Real: GET https://danepubliczne.imgw.pl/api/data/warningsmeteo on 24 Oct
 * 2026 at 18:48 UK time, body verbatim (4025 bytes): 8 warnings, none for
 * powiat 1809.
 */
export const REAL_2026_10_24 =
  '[{"id":"Sk20261024094211181","nazwa_zdarzenia":"Silny wiatr","stopien":"2","prawdopodobienstwo":"75","obowiazuje_do":"2026-10-25 18:00:00","obowiazuje_od":"2026-10-25 08:00:00","opublikowano":"2026-10-24 11:42:00","tresc":"Prognozuje si\\u0119 wyst\\u0105pienie silnego wiatru o \\u015bredniej pr\\u0119dko\\u015bci do 45 km\\/h, w porywach do 90 km\\/h, z po\\u0142udnia.","komentarz":"Brak.","biuro":"Centralne Biuro Prognoz Meteorologicznych w Warszawie","teryt":["0221","0207","0206","0212","0261","0265"]},{"id":"Sk20261024094212544","nazwa_zdarzenia":"Silny wiatr","stopien":"1","prawdopodobienstwo":"75","obowiazuje_do":"2026-10-25 18:00:00","obowiazuje_od":"2026-10-25 08:00:00","opublikowano":"2026-10-24 11:42:00","tresc":"Prognozuje si\\u0119 wyst\\u0105pienie silnego wiatru o \\u015bredniej pr\\u0119dko\\u015bci do 40 km\\/h, w porywach do 85 km\\/h, z po\\u0142udnia.","komentarz":"Brak.","biuro":"Centralne Biuro Prognoz Meteorologicznych w Warszawie","teryt":["0208"]},{"id":"Sk20261024094213861","nazwa_zdarzenia":"Silny wiatr","stopien":"1","prawdopodobienstwo":"75","obowiazuje_do":"2026-10-25 19:00:00","obowiazuje_od":"2026-10-25 12:00:00","opublikowano":"2026-10-24 11:42:00","tresc":"Prognozuje si\\u0119 wyst\\u0105pienie silnego wiatru o \\u015bredniej pr\\u0119dko\\u015bci do 40 km\\/h, w porywach do 75 km\\/h, z po\\u0142udnia.","komentarz":"Brak.","biuro":"Centralne Biuro Prognoz Meteorologicznych w Warszawie","teryt":["2804","2861","2802"]},{"id":"Sk20261024094216930","nazwa_zdarzenia":"Silny wiatr","stopien":"1","prawdopodobienstwo":"80","obowiazuje_do":"2026-10-25 21:00:00","obowiazuje_od":"2026-10-25 10:00:00","opublikowano":"2026-10-24 11:42:00","tresc":"Prognozuje si\\u0119 wyst\\u0105pienie silnego wiatru o \\u015bredniej pr\\u0119dko\\u015bci do 40 km\\/h, w porywach do 80 km\\/h, z po\\u0142udnia.","komentarz":"Brak.","biuro":"Centralne Biuro Prognoz Meteorologicznych w Warszawie","teryt":["1205","2402","1210","1217","1207","2461","2403","1211","1215","1262","2417"]},{"id":"Sk20261024094213061","nazwa_zdarzenia":"Silny wiatr","stopien":"1","prawdopodobienstwo":"75","obowiazuje_do":"2026-10-25 19:00:00","obowiazuje_od":"2026-10-25 13:00:00","opublikowano":"2026-10-24 11:42:00","tresc":"Prognozuje si\\u0119 wyst\\u0105pienie do\\u015b\\u0107 silnego wiatru o \\u015bredniej pr\\u0119dko\\u015bci do 35 km\\/h, w porywach do 75 km\\/h, z po\\u0142udnia.","komentarz":"Brak.","biuro":"Centralne Biuro Prognoz Meteorologicznych w Warszawie","teryt":["1861","1801","1805","1807","1817","1821"]},{"id":"Sk20261024094212021","nazwa_zdarzenia":"Silny wiatr","stopien":"1","prawdopodobienstwo":"75","obowiazuje_do":"2026-10-25 15:00:00","obowiazuje_od":"2026-10-25 08:00:00","opublikowano":"2026-10-24 11:42:00","tresc":"Prognozuje si\\u0119 wyst\\u0105pienie silnego wiatru o \\u015bredniej pr\\u0119dko\\u015bci do 40 km\\/h, w porywach do 80 km\\/h, z po\\u0142udnia.","komentarz":"Brak.","biuro":"Centralne Biuro Prognoz Meteorologicznych w Warszawie","teryt":["0225","0210"]},{"id":"Sk20261024094216309","nazwa_zdarzenia":"Silny wiatr","stopien":"1","prawdopodobienstwo":"80","obowiazuje_do":"2026-10-25 19:00:00","obowiazuje_od":"2026-10-25 10:00:00","opublikowano":"2026-10-24 11:42:00","tresc":"Prognozuje si\\u0119 wyst\\u0105pienie silnego wiatru o \\u015bredniej pr\\u0119dko\\u015bci do 50 km\\/h, w porywach do 75 km\\/h, z po\\u0142udnia.","komentarz":"Brak.","biuro":"Centralne Biuro Prognoz Meteorologicznych w Warszawie","teryt":["2210","2211","2208","2215","2263","2212","2261","2262","2264"]},{"id":"Sk20261024094214582","nazwa_zdarzenia":"Silny wiatr","stopien":"1","prawdopodobienstwo":"80","obowiazuje_do":"2026-10-25 16:00:00","obowiazuje_od":"2026-10-25 08:00:00","opublikowano":"2026-10-24 11:42:00","tresc":"Prognozuje si\\u0119 wyst\\u0105pienie silnego wiatru o \\u015bredniej pr\\u0119dko\\u015bci do 50 km\\/h, w porywach do 75 km\\/h, z po\\u0142udnia.","komentarz":"Brak.","biuro":"Centralne Biuro Prognoz Meteorologicznych w Warszawie","teryt":["3205","3207","3208","3209","3211","3213","3261","3262","3263"]}]';

/**
 * Real: the same endpoint with no warnings in force, 18 Oct 2026, body
 * verbatim (sources/imgw/2026-10-18/imgw_warningsmeteo_2026-10-18.json):
 * an object, not an empty list.
 */
export const NO_WARNINGS_2026_10_18 =
  '{"message":"Brak ostrze\\u017ce\\u0144 meteorologicznych"}';

/**
 * Real: the same 8 warnings as meteo.imgw.pl published them at the same time
 * (osmet-teryt), times with their zone: [LxValidFrom, LxValidTo,
 * LxReleaseDateTime] by id, verbatim. Only these three fields are kept.
 */
export const ZONED_2026_10_24: Record<string, [string, string, string]> = {
  Sk20261024094211181: [
    "2026-10-25T08:00:00+01:00",
    "2026-10-25T18:00:00+01:00",
    "2026-10-24T11:42:00+02:00",
  ],
  Sk20261024094212544: [
    "2026-10-25T08:00:00+01:00",
    "2026-10-25T18:00:00+01:00",
    "2026-10-24T11:42:00+02:00",
  ],
  Sk20261024094213861: [
    "2026-10-25T12:00:00+01:00",
    "2026-10-25T19:00:00+01:00",
    "2026-10-24T11:42:00+02:00",
  ],
  Sk20261024094216930: [
    "2026-10-25T10:00:00+01:00",
    "2026-10-25T21:00:00+01:00",
    "2026-10-24T11:42:00+02:00",
  ],
  Sk20261024094213061: [
    "2026-10-25T13:00:00+01:00",
    "2026-10-25T19:00:00+01:00",
    "2026-10-24T11:42:00+02:00",
  ],
  Sk20261024094212021: [
    "2026-10-25T08:00:00+01:00",
    "2026-10-25T15:00:00+01:00",
    "2026-10-24T11:42:00+02:00",
  ],
  Sk20261024094216309: [
    "2026-10-25T10:00:00+01:00",
    "2026-10-25T19:00:00+01:00",
    "2026-10-24T11:42:00+02:00",
  ],
  Sk20261024094214582: [
    "2026-10-25T08:00:00+01:00",
    "2026-10-25T16:00:00+01:00",
    "2026-10-24T11:42:00+02:00",
  ],
};

/**
 * DERIVED, NOT REAL: REAL_2026_10_24 with "1809" (powiat lubaczowski) added
 * to the teryt list of its podkarpackie warning (Sk20261024094213061, level
 * 1, which covered 1801, 1805, 1807, 1817, 1821 and 1861). IMGW never
 * published a warning for 1809 that day.
 */
export const DERIVED_1809_ID = "Sk20261024094213061";

export function derived1809(): unknown[] {
  const feed: Array<{ id: string; teryt: string[] }> =
    JSON.parse(REAL_2026_10_24);
  return feed.map((warning) =>
    warning.id === DERIVED_1809_ID
      ? { ...warning, teryt: [...warning.teryt, "1809"] }
      : warning,
  );
}
