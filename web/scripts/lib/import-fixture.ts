// A tiny made-up dataset in the ETL's output format, for the importer's tests
// and the CI check (never the real data). Dates are relative to `today`, so
// there is always something upcoming. Source files are small text files the
// check serves itself, so the source check runs without the internet.
import { addDays } from "../../lib/dates.ts";
import { sha256 } from "../import/core/hash.ts";
import { type Etl, eventId } from "./import-data.ts";

export const FIXTURE_IDS = {
  asnyka: "0972447-00470",
  unzonedStreet: "0972447-23434",
  rondo: "0972447-90100",
  village: "0606010",
  /** A village part with no zone entry of its own (takes its village's). */
  villagePart: "0605967",
};

export function fixture(today: string, sourceBase: string) {
  const files: Record<string, string> = {
    "miasto-s1.txt": "Harmonogram testowy, miasto, sektor 1\n",
    "gmina-s1.txt": "Harmonogram testowy, gmina, sektor 1\n",
  };
  const sha = (name: string) => sha256(files[name]);
  const sources = Object.keys(files).map((name) => ({
    doc: `docs/data/test/${name}`,
    kind: name.startsWith("miasto") ? "miasto" : "gmina",
    url: `${sourceBase}/${name}`,
    sha256: sha(name),
  }));
  const zone = (id: string, name: string) => ({ id, name });
  const zonesList = [
    zone("waste:miasto-s1", "Miasto Lubaczów, sektor 1"),
    zone("waste:gmina-s1", "Gmina Lubaczów, sektor 1"),
  ];

  const events: Etl["events"] = [];
  zonesList.forEach(({ id }, i) => {
    const source = sources[i];
    const plan: Array<[string, string, number]> = [
      ["zmieszane", "Zmieszane", 3],
      ["bio", "Bio", 3],
      ["papier", "Papier", 10],
      ["zmieszane", "Zmieszane", 17],
      ["szklo", "Szkło", 24],
      ["zmieszane", "Zmieszane", 31],
    ];
    plan.forEach(([subtype, label, days], cell) => {
      const start = addDays(today, days + i);
      events.push({
        id: eventId(id, subtype, start),
        type: "waste",
        subtype,
        zoneId: id,
        start,
        allDay: true,
        label,
        source: {
          doc: source.doc,
          url: source.url,
          ref: `month=1;row=${subtype};cell=${cell}`,
          sha256: source.sha256,
        },
      });
    });
  });

  const etl: Etl = {
    gminy: [
      { id: "lubaczow-miasto", teryt: "1809011", name: "Lubaczów (miasto)" },
      { id: "lubaczow-gmina", teryt: "1809042", name: "Lubaczów (gmina)" },
    ],
    localities: [
      {
        id: "simc-0605967",
        gminaId: "lubaczow-gmina",
        teryt: "0605967",
        name: "Dąbrowa",
        kind: "czesc_wsi",
        parentId: "simc-0605950",
      },
      {
        id: "simc-0972447",
        gminaId: "lubaczow-miasto",
        teryt: "0972447",
        name: "Lubaczów",
        kind: "miasto",
      },
      {
        id: "simc-0606010",
        gminaId: "lubaczow-gmina",
        teryt: "0606010",
        name: "Dąbrowa",
        kind: "wies",
      },
      {
        id: "simc-0605950",
        gminaId: "lubaczow-gmina",
        teryt: "0605950",
        name: "Basznia Górna",
        kind: "wies",
      },
    ],
    streets: [
      ["00470", "ul.", "Adama Asnyka"],
      ["23434", "ul.", "Ustronna"],
      ["90100", "rondo", "Rondo Testowe"],
      ["90101", "os.", "Osiedle Testowe"],
    ].map(([sym, prefix, name]) => ({
      id: `ulic-0972447-${sym}`,
      localityId: "simc-0972447",
      teryt: sym,
      prefix,
      name,
    })),
    zones: [
      {
        ...zonesList[0],
        type: "waste",
        members: ["00470", "90101"].map((sym) => ({
          localityId: "simc-0972447",
          streetId: `ulic-0972447-${sym}`,
        })),
      },
      {
        ...zonesList[1],
        type: "waste",
        members: [
          { localityId: "simc-0606010" },
          { localityId: "simc-0605950" },
        ],
      },
    ],
    events,
    meta: {
      year: Number(today.slice(0, 4)),
      provisional: true,
      flags: ["test_fixture"],
      sources,
    },
  };
  return { etl, files };
}
