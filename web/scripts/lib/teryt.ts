// GUS TERYT files (ULIC streets, SIMC localities), as eTERYT serves them:
// semicolon-separated CSV, UTF-8 with a BOM, CRLF lines. TERYT is the one
// source of place and street names and types (CLAUDE.md). Rules from GUS,
// "Zasady implementacji słowników TERYT":
// https://eteryt.stat.gov.pl/eTeryt/rejestr_teryt/udostepnianie_danych/zasady_implementacji_slownikow/zasady_implementacji_slownikow.aspx
// - a SIMC id (SYM) is unique and never changes, not on a rename, a type or
//   an administrative change;
// - a ULIC id (SYM_UL) identifies a street NAME with its CECHA: the same in
//   every locality, a different one on a rename or another CECHA;
// - the full name is CECHA + NAZWA_2 + NAZWA_1 (lib/places.ts terytName).

import { terytName } from "../../lib/places.ts";

export type UlicRow = {
  /** TERC of the gmina: WOJ POW GMI RODZ_GMI, e.g. "1809011". */
  terc: string;
  /** SIMC SYM of the street's locality. */
  simc: string;
  symUl: string;
  cecha: string;
  nazwa1: string;
  nazwa2: string | null;
};

export type SimcRow = {
  terc: string;
  simc: string;
  name: string;
  /** RM, the kind of locality (GUS code: 01 wieś, 00 część, 96 miasto…). */
  rm: string;
  /** SYMPOD when the locality is part of another; null when its own. */
  parent: string | null;
};

function rows(text: string): Array<Record<string, string>> {
  const [head, ...lines] = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim());
  const columns = head.split(";");
  return lines.map((line) => {
    const cells = line.split(";");
    return Object.fromEntries(columns.map((c, i) => [c, cells[i] ?? ""]));
  });
}

const terc = (r: Record<string, string>) =>
  `${r.WOJ}${r.POW}${r.GMI}${r.RODZ_GMI}`;

export function parseUlic(text: string): UlicRow[] {
  return rows(text).map((r) => ({
    terc: terc(r),
    simc: r.SYM,
    symUl: r.SYM_UL,
    cecha: r.CECHA,
    nazwa1: r.NAZWA_1.trim(),
    nazwa2: r.NAZWA_2.trim() || null,
  }));
}

export function parseSimc(text: string): SimcRow[] {
  return rows(text).map((r) => ({
    terc: terc(r),
    simc: r.SYM,
    name: r.NAZWA,
    rm: r.RM,
    parent: r.SYMPOD && r.SYMPOD !== r.SYM ? r.SYMPOD : null,
  }));
}

/** A ULIC row's name as the pages show it, without the CECHA. */
export const ulicName = (row: UlicRow) => terytName(row.nazwa1, row.nazwa2);

/** Our street, as the database holds it (or as built from TERYT files). */
type OurStreet = {
  /** SIMC of its locality and its SYM_UL. */
  simc: string;
  symUl: string;
  cecha: string;
  /** NAZWA_2 NAZWA_1, as the pages show it. */
  name: string;
};

type OurLocality = {
  terc: string;
  simc: string;
  name: string;
  parent: string | null;
};

export type Ours = { streets: OurStreet[]; localities: OurLocality[] };

/**
 * One difference, in the codes of TERYT's update files: D added, M changed
 * (name, CECHA, parent), U removed. A renamed street is a U plus a D (a new
 * SYM_UL); `maybe` names the D streets in the same locality, as candidates.
 */
export type TerytChange = {
  code: "D" | "M" | "U";
  kind: "street" | "locality";
  id: string;
  what: string;
  maybe?: string[];
};

const streetId = (s: { simc: string; symUl: string }) => `${s.simc}-${s.symUl}`;

/** What our data would be if built from these TERYT rows. */
export function oursFromTeryt(ulic: UlicRow[], simc: SimcRow[]): Ours {
  return {
    streets: ulic.map((r) => ({
      simc: r.simc,
      symUl: r.symUl,
      cecha: r.cecha,
      name: ulicName(r),
    })),
    localities: simc.map((r) => ({
      terc: r.terc,
      simc: r.simc,
      name: r.name,
      parent: r.parent,
    })),
  };
}

/**
 * Every difference between our places and TERYT, for the gminy `tercs`
 * (TERYT rows outside them are ignored), by id. Never applied: a person
 * reviews it (waste zones map streets by name).
 */
export function terytDiff(
  ours: Ours,
  ulic: UlicRow[],
  simc: SimcRow[],
  tercs: string[],
): TerytChange[] {
  const changes: TerytChange[] = [];
  const inScope = (r: { terc: string }) => tercs.includes(r.terc);
  const localities = new Map(simc.filter(inScope).map((r) => [r.simc, r]));
  const name = (id: string | null) =>
    id ? (localities.get(id)?.name ?? id) : "none";
  const ourLocalities = new Map(
    ours.localities.filter(inScope).map((l) => [l.simc, l]),
  );
  for (const [id, l] of ourLocalities) {
    const row = localities.get(id);
    if (!row) {
      changes.push({ code: "U", kind: "locality", id, what: l.name });
      continue;
    }
    if (row.name !== l.name)
      changes.push({
        code: "M",
        kind: "locality",
        id,
        what: `renamed "${l.name}" → "${row.name}"`,
      });
    if (row.parent !== l.parent)
      changes.push({
        code: "M",
        kind: "locality",
        id,
        what: `${row.name}: part of ${name(l.parent)} → ${name(row.parent)}`,
      });
  }
  for (const [id, row] of localities) {
    if (!ourLocalities.has(id))
      changes.push({ code: "D", kind: "locality", id, what: row.name });
  }

  // Streets of our gminy: TERYT's in scope, ours in our localities there.
  const streets = new Map(ulic.filter(inScope).map((r) => [streetId(r), r]));
  const ourStreets = new Map(
    ours.streets
      .filter((s) => ourLocalities.has(s.simc))
      .map((s) => [streetId(s), s]),
  );
  const added = [...streets.values()].filter(
    (r) => !ourStreets.has(streetId(r)),
  );
  const full = (cecha: string, text: string) => `${cecha} ${text}`;
  for (const [id, s] of ourStreets) {
    const row = streets.get(id);
    const where = name(s.simc);
    if (!row) {
      const maybe = added
        .filter((r) => r.simc === s.simc)
        .map((r) => `${streetId(r)} ${full(r.cecha, ulicName(r))}`);
      changes.push({
        code: "U",
        kind: "street",
        id,
        what: `${full(s.cecha, s.name)}, ${where}`,
        ...(maybe.length > 0 && { maybe }),
      });
      continue;
    }
    if (row.cecha !== s.cecha || ulicName(row) !== s.name)
      changes.push({
        code: "M",
        kind: "street",
        id,
        what: `"${full(s.cecha, s.name)}" → "${full(row.cecha, ulicName(row))}", ${where}`,
      });
  }
  for (const r of added) {
    changes.push({
      code: "D",
      kind: "street",
      id: streetId(r),
      what: `${full(r.cecha, ulicName(r))}, ${name(r.simc)}`,
    });
  }
  return changes.sort(
    (a, b) => a.code.localeCompare(b.code) || a.id.localeCompare(b.id),
  );
}

/** The review issue's table, one row per change. */
export function changesTable(changes: TerytChange[]): string {
  const rows = changes.map(
    (c) =>
      `| ${c.code} | ${c.kind === "street" ? "ulica" : "miejscowość"} | \`${c.id}\` | ${c.what}${c.maybe ? `<br>maybe: ${c.maybe.join(", ")}` : ""} |`,
  );
  return ["| | | id | |", "|---|---|---|---|", ...rows].join("\n");
}

/** A ZUK place snapshot's rows (lib/zuk-places.generated.ts). */
export type PlaceRows = {
  /** "SIMC;name;kind;parent SIMC or empty". */
  localities: string[];
  /** "SIMC-SYM_UL;SIMC;name;CECHA;NAZWA_1", CECHA and NAZWA_1 raw. */
  streets: string[];
};

/**
 * Our places as TERYT gives them, for the gminy `tercs`: every locality
 * (with a parent, a village part; RM 96 the town; else a village) and every
 * street, as the database holds them (docs/database.md), ordered by id.
 */
export function placeRows(
  ulic: UlicRow[],
  simc: SimcRow[],
  tercs: string[],
): PlaceRows {
  const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const kind = (r: SimcRow) =>
    r.parent ? "czesc_wsi" : r.rm === "96" ? "miasto" : "wies";
  return {
    localities: simc
      .filter((r) => tercs.includes(r.terc))
      .map((r) => `${r.simc};${r.name};${kind(r)};${r.parent ?? ""}`)
      .sort(byId),
    streets: ulic
      .filter((r) => tercs.includes(r.terc))
      .map(
        (r) => `${streetId(r)};${r.simc};${ulicName(r)};${r.cecha};${r.nazwa1}`,
      )
      .sort(byId),
  };
}
