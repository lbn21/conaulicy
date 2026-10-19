/*
  FIXTURE, NOT PRODUCTION DATA.

  Hand-copied slice for the UI skeleton. Not the full year, and not a
  dataset to publish. Transcribed window: October–December 2026 for the
  regular fractions, plus the bulky-waste dates (March and September).
  Every event is verified: false, reviewedBy: null.

  City streets (both Sektor 1 on the poster):
    docs/data/miasto/harmonogram-2026-s1.jpg
    sha256 cd2dabc9053dc72111495a8ac4bcf1af36f0a7366af452b40806368fafaad624
  The poster does not say to put bins out by a given hour.

  Villages Lisie Jamy and Dąbrowa (same table, with Szczutków):
    docs/data/gmina/1_2026_Lisie_Jamy_Dabrowa_Szczutkow.pdf
    sha256 139159406cbc20a5227225a428d65ee94962f55383ea0f3e235ef2d2ca760fcc
  Zmieszane and bio are one column ("ZMIESZANE I BIO"), so they stay one
  event. The sheet says to put waste out by 06:00.

  ul. Ustronna is a real Lubaczów street in no sector
  (docs/data/DATA-INVENTORY.md). No zone, no dates, no guess.

  TERYT SYM / SYM_UL values are copied from the unverified prototype
  docs/data/sample/address-register.sample.json. Fixture ids only.

  Only web/lib/schedule.ts may import this file.
*/
import "server-only";
import { createHash } from "node:crypto";
import type { Event, Gmina, Locality, Street, Zone } from "@/lib/data-model";

export const gminy: Gmina[] = [
  { id: "1809011", teryt: "1809011", name: "Lubaczów (miasto)" },
  { id: "1809042", teryt: "1809042", name: "Lubaczów (gmina)" },
];

export const localities: Locality[] = [
  {
    id: "0972447",
    gminaId: "1809011",
    teryt: "0972447",
    name: "Lubaczów",
    kind: "miasto",
  },
  {
    id: "0606234",
    gminaId: "1809042",
    teryt: "0606234",
    name: "Lisie Jamy",
    kind: "wies",
  },
  {
    id: "0606010",
    gminaId: "1809042",
    teryt: "0606010",
    name: "Dąbrowa",
    kind: "wies",
  },
];

export const streets: Street[] = [
  {
    id: "0972447-00470",
    localityId: "0972447",
    teryt: "00470",
    prefix: "ul.",
    name: "Adama Asnyka",
  },
  {
    id: "0972447-20291",
    localityId: "0972447",
    teryt: "20291",
    prefix: "ul.",
    name: "Juliusza Słowackiego",
  },
  {
    id: "0972447-23434",
    localityId: "0972447",
    teryt: "23434",
    prefix: "ul.",
    name: "Ustronna",
  },
];

export const zones: Zone[] = [
  {
    id: "waste:miasto-s1",
    type: "waste",
    name: "Lubaczów (S1)",
    members: [
      { localityId: "0972447", streetId: "0972447-00470" },
      { localityId: "0972447", streetId: "0972447-20291" },
    ],
  },
  {
    id: "waste:gmina-s1",
    type: "waste",
    name: "Lisie Jamy i Dąbrowa",
    members: [{ localityId: "0606234" }, { localityId: "0606010" }],
  },
];

type Source = Event["source"];

const CITY_SOURCE: Source = {
  doc: "docs/data/miasto/harmonogram-2026-s1.jpg",
  sha256: "cd2dabc9053dc72111495a8ac4bcf1af36f0a7366af452b40806368fafaad624",
  ref: "Sektor 1, październik–grudzień 2026 oraz wielkogabarytowe",
};

const GMINA_SOURCE: Source = {
  doc: "docs/data/gmina/1_2026_Lisie_Jamy_Dabrowa_Szczutkow.pdf",
  sha256: "139159406cbc20a5227225a428d65ee94962f55383ea0f3e235ef2d2ca760fcc",
  ref: "Lisie Jamy, Dąbrowa, Szczutków",
};

type Row = {
  subtype: string;
  label: string;
  dates: string[];
  payload?: Record<string, unknown>;
};

function wasteEvents(zoneId: string, source: Source, rows: Row[]): Event[] {
  return rows.flatMap(({ subtype, label, dates, payload }) =>
    dates.map((start) => ({
      id: createHash("sha256")
        .update(`${zoneId}|${subtype}|${start}`)
        .digest("hex"),
      type: "waste" as const,
      subtype,
      zoneId,
      start,
      allDay: true,
      label,
      source,
      verified: false,
      reviewedBy: null,
      reviewedAt: null,
      ...(payload ? { payload } : {}),
    })),
  );
}

const CITY_MIXED = [
  "2026-10-05",
  "2026-10-19",
  "2026-11-02",
  "2026-11-16",
  "2026-11-30",
  "2026-12-14",
  "2026-12-28",
];
const CITY_RECYCLING = ["2026-10-05", "2026-11-02", "2026-12-07"];
const CITY_BIO = ["2026-10-12", "2026-10-26", "2026-11-09", "2026-12-07"];
const CITY_BULKY = ["2026-03-05", "2026-09-03"];

const GMINA_MIXED_BIO = [
  "2026-10-05",
  "2026-10-19",
  "2026-11-16",
  "2026-12-14",
];
const GMINA_RECYCLING = ["2026-10-19", "2026-11-16", "2026-12-14"];
const GMINA_BULKY = ["2026-03-24", "2026-09-22"];

const GMINA_PUT_OUT = { putOutBy: "06:00" };

export const events: Event[] = [
  ...wasteEvents("waste:miasto-s1", CITY_SOURCE, [
    { subtype: "zmieszane", label: "Zmieszane", dates: CITY_MIXED },
    { subtype: "popiol", label: "Popiół", dates: CITY_MIXED },
    { subtype: "papier", label: "Papier", dates: CITY_RECYCLING },
    {
      subtype: "tworzywa",
      label: "Tworzywa sztuczne",
      dates: CITY_RECYCLING,
    },
    { subtype: "szklo", label: "Szkło", dates: CITY_RECYCLING },
    { subtype: "bio", label: "Bio", dates: CITY_BIO },
    {
      subtype: "wielkogabarytowe",
      label: "Wielkogabarytowe",
      dates: CITY_BULKY,
    },
    {
      subtype: "elektro",
      label: "Elektryczne i elektroniczne",
      dates: CITY_BULKY,
    },
    { subtype: "opony", label: "Zużyte opony", dates: CITY_BULKY },
    { subtype: "tekstylia", label: "Tekstylia", dates: CITY_BULKY },
  ]),
  ...wasteEvents("waste:gmina-s1", GMINA_SOURCE, [
    {
      subtype: "zmieszane_i_bio",
      label: "Zmieszane i bio",
      dates: GMINA_MIXED_BIO,
      payload: GMINA_PUT_OUT,
    },
    {
      subtype: "papier",
      label: "Papier",
      dates: GMINA_RECYCLING,
      payload: GMINA_PUT_OUT,
    },
    {
      subtype: "tworzywa_metale",
      label: "Tworzywa i metale",
      dates: GMINA_RECYCLING,
      payload: GMINA_PUT_OUT,
    },
    {
      subtype: "szklo",
      label: "Szkło",
      dates: GMINA_RECYCLING,
      payload: GMINA_PUT_OUT,
    },
    {
      subtype: "wielkogabarytowe",
      label: "Wielkogabarytowe",
      dates: GMINA_BULKY,
      payload: GMINA_PUT_OUT,
    },
  ]),
];
