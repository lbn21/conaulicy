import "server-only";
import { events, gminy, localities, streets, zones } from "@/fixtures/schedule";
import type { Event, Zone } from "@/lib/data-model";
import { todayInWarsaw } from "@/lib/dates";

export type SearchHit = { id: string; label: string };

type Place = {
  id: string;
  kind: "ulica" | "wies";
  name: string;
  label: string;
  area: string;
  localityId: string;
  streetId?: string;
};

export type Pickup = {
  id: string;
  subtype: string;
  label: string;
  putOutBy: string | null;
};

export type PickupDay = { date: string; pickups: Pickup[] };

export type PlaceView = {
  id: string;
  kind: Place["kind"];
  name: string;
  label: string;
  area: string;
  zoneId: string | null;
  schedulePage: string | null;
  days: PickupDay[];
  /** Human labels of the source documents, e.g. "Sektor 1, październik–grudzień 2026". */
  sources: string[];
  verified: boolean;
};

const SUBTYPE_ORDER = [
  "zmieszane",
  "zmieszane_i_bio",
  "popiol",
  "bio",
  "papier",
  "tworzywa",
  "tworzywa_metale",
  "szklo",
  "wielkogabarytowe",
  "elektro",
  "opony",
  "tekstylia",
];

/** Official schedule page per gmina, from docs/data/DATA-INVENTORY.md. */
const SCHEDULE_PAGE: Record<string, string> = {
  "1809011":
    "https://czystylubaczow.info/odbior-odpadow/harmonogram-odbioru-odpadow/",
  "1809042":
    "https://www.gminalubaczow.pl/2026/01/02/harmonogram-odbioru-odpadow-komunalnych-na-rok-2026/",
};

const DIACRITICS: Record<string, string> = {
  ą: "a",
  ć: "c",
  ę: "e",
  ł: "l",
  ń: "n",
  ó: "o",
  ś: "s",
  ź: "z",
  ż: "z",
};

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (ch) => DIACRITICS[ch])
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function gminaShortName(gminaId: string): string {
  const name = gminy.find((g) => g.id === gminaId)?.name ?? "";
  return name.replace(/\s*\(.*\)$/, "");
}

const places: Place[] = [
  ...streets.map((street): Place => {
    const city = localities.find((l) => l.id === street.localityId);
    const name = `${street.prefix} ${street.name}`;
    return {
      id: street.id,
      kind: "ulica",
      name,
      label: `${name}, ${city?.name ?? ""}`,
      area: city?.name ?? "",
      localityId: street.localityId,
      streetId: street.id,
    };
  }),
  ...localities
    .filter((l) => l.kind !== "miasto")
    .map((village): Place => {
      const gmina = gminaShortName(village.gminaId);
      return {
        id: village.id,
        kind: "wies",
        name: village.name,
        label: `${village.name} (gm. ${gmina})`,
        area: `gmina ${gmina}`,
        localityId: village.id,
      };
    }),
];

const searchIndex = places.map((place) => ({
  place,
  haystack: normalize(place.label),
}));

export function listPlaces(): SearchHit[] {
  return places.map(({ id, label }) => ({ id, label }));
}

export function search(q: string): SearchHit[] {
  const terms = normalize(q).split(" ").filter(Boolean);
  if (terms.length === 0) return [];
  return searchIndex
    .filter(({ haystack }) => terms.every((term) => haystack.includes(term)))
    .slice(0, 8)
    .map(({ place }) => ({ id: place.id, label: place.label }));
}

function wasteZoneFor(place: Place): Zone | undefined {
  return zones.find(
    (zone) =>
      zone.type === "waste" &&
      zone.members.some((m) =>
        m.streetId
          ? m.streetId === place.streetId
          : m.localityId === place.localityId,
      ),
  );
}

function schedulePageFor(place: Place): string | null {
  const gminaId = localities.find((l) => l.id === place.localityId)?.gminaId;
  return (gminaId && SCHEDULE_PAGE[gminaId]) || null;
}

function bySubtype(a: Event, b: Event): number {
  return SUBTYPE_ORDER.indexOf(a.subtype) - SUBTYPE_ORDER.indexOf(b.subtype);
}

function zoneEvents(zoneId: string, from?: string) {
  return events
    .filter(
      (e) => e.zoneId === zoneId && (from === undefined || e.start >= from),
    )
    .sort((a, b) => a.start.localeCompare(b.start) || bySubtype(a, b));
}

export function upcomingForZone(zoneId: string, today = todayInWarsaw()) {
  return zoneEvents(zoneId, today);
}

export function getPlace(id: string): PlaceView | null {
  const place = places.find((p) => p.id === id);
  if (!place) return null;

  const zone = wasteZoneFor(place);
  // Event dates are ISO days in Europe/Warsaw, so compare against the Warsaw day, not UTC.
  const upcoming = zone ? zoneEvents(zone.id, todayInWarsaw()) : [];

  const days: PickupDay[] = [];
  for (const event of upcoming) {
    const pickup: Pickup = {
      id: event.id,
      subtype: event.subtype,
      label: event.label,
      putOutBy:
        typeof event.payload?.putOutBy === "string"
          ? event.payload.putOutBy
          : null,
    };
    const last = days.at(-1);
    if (last?.date === event.start) last.pickups.push(pickup);
    else days.push({ date: event.start, pickups: [pickup] });
  }

  return {
    id: place.id,
    kind: place.kind,
    name: place.name,
    label: place.label,
    area: place.area,
    zoneId: zone?.id ?? null,
    schedulePage: schedulePageFor(place),
    days,
    sources: [
      ...new Set(
        upcoming.map(
          (e) => e.source.ref ?? e.source.doc.split("/").at(-1) ?? "",
        ),
      ),
    ],
    verified: upcoming.every((e) => e.verified),
  };
}

export function getZone(zoneId: string) {
  const zone = zones.find((z) => z.id === zoneId);
  if (!zone) return null;
  return { id: zone.id, name: zone.name, events: upcomingForZone(zone.id) };
}
