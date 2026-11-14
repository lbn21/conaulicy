// What the power module (lib/modules.ts) says about a place: PGE
// Dystrybucja's outages (lib/pge-feed.ts, the cron's last good copy) at
// this address, in the shapes every outages module shares: timeline items
// (lib/upcoming.ts, components/rows/outage.tsx) and the subpage
// (lib/outage-view.ts, components/outage-page.tsx). Pure, so the unit
// tests read every state. docs/data/pge.md.
//
// Matching: the one rule (lib/place-match.ts), on each address's TERYT
// locality and street; PGE's house numbers are shown as given, never
// compared with the address's. Places are named from TERYT, never PGE's
// words. A planned outage PGE lists in the latest copy is shown until its
// scheduled end passes, or a later copy no longer lists it. A failure is
// shown as long as the latest copy lists it, whatever its end, which is
// only PGE's estimate („ok.”; its span `about`, lib/timeline.ts onDay);
// never by the copy's age. A revoked outage is never in the timeline; the
// subpage keeps it, tagged, until its time is over.
// PGE's checks failing, a notice says since when, as IMGW's
// (lib/live-status.ts liveNotice).

import type { PlaceView } from "@/lib/schedule";
import { fromTo } from "../components/rows/when.ts";
import { warsawDay } from "./date-labels.ts";
import {
  capitalised,
  type Group,
  type Part,
  span,
  uncheckedText,
} from "./hub.ts";
import { type LiveCopy, liveNotice, UNREADABLE } from "./live-status.ts";
import { LIST } from "./locale.ts";
import { hoursRow, type OutagePage } from "./outage-view.ts";
import type { PgeFeed, PgeOutage } from "./pge-feed.ts";
import { matches, type PlaceRef } from "./place-match.ts";
import { streetName } from "./places.ts";
import type { Item } from "./upcoming.ts";
import { ZUK_PLACES } from "./zuk-places.generated.ts";

/** Who publishes the outages, as the pages credit them. */
export const PGE_NAME = "PGE Dystrybucja";

/** The same declined, after „według”, „od”, „na stronie”. */
export const PGE_GENITIVE = "PGE Dystrybucji";

/** PGE Dystrybucja's public page of current outages: the source link. */
export const PGE_PAGE =
  "https://pgedystrybucja.pl/wylaczenia/aktualne-przerwy-w-dostawie-energii";

/** What the pages read from the store (lib/live-reads.ts). */
export type PgeRead = LiveCopy<PgeFeed> | null | typeof UNREADABLE;

/** One of the outage's addresses here: our name, PGE's numbers as given. */
type Where = { name: string; numbers: string | null };

type PowerCut = Pick<PgeOutage, "uuid" | "kind" | "revoked" | "revokedNote"> & {
  /** Its ranges not over yet, ISO, soonest first. */
  ranges: PgeOutage["ranges"];
  where: Where[];
};

export type Power = {
  place: PlaceView;
  /** The outages here not over yet, soonest first; revoked ones too. */
  cuts: PowerCut[];
  /** The copy is old or unreadable: what we say, before PGE's link. */
  notice: string | null;
  /** The copy is shown (the store could be read). */
  shown: boolean;
  /** When PGE's items last changed (ms); null: unknown. */
  changedAt: number | null;
};

const LOCALITY = new Map(ZUK_PLACES.localities.map((l) => [l.id, l.name]));
const STREET = new Map(ZUK_PLACES.streets.map((s) => [s.id, s]));

/** An address's TERYT place: its locality, and its street or null. */
const ref = (a: PgeOutage["addresses"][number]): PlaceRef => ({
  localityId: a.simc,
  streetId: a.ulic === null ? null : `${a.simc}-${a.ulic}`,
});

/**
 * Its TERYT name for the page of `place`: a street („ul. Rynek”, its
 * locality after it when it is another's), else the locality.
 */
function nameOf(address: PlaceRef, place: PlaceRef): string {
  const locality = LOCALITY.get(address.localityId) ?? address.localityId;
  const street = address.streetId && STREET.get(address.streetId);
  if (!street) return locality;
  const name = streetName(street.cecha, street.name);
  return street.localityId === place.localityId ? name : `${name}, ${locality}`;
}

/**
 * The outage at the address; or null. A planned one: its ranges not over
 * by `now`; a failure: every range, as long as PGE lists it.
 */
function cutAt(item: PgeOutage, place: PlaceRef, now: number): PowerCut | null {
  const here = item.addresses.filter((a) => matches(place, ref(a)));
  if (here.length === 0) return null;
  const ranges =
    item.kind === "failure"
      ? item.ranges
      : item.ranges.filter((r) => Date.parse(r.end) > now);
  if (ranges.length === 0) return null;
  return {
    uuid: item.uuid,
    kind: item.kind,
    revoked: item.revoked,
    revokedNote: item.revokedNote,
    ranges,
    where: here.map((a) => ({
      name: nameOf(ref(a), place),
      numbers: a.numbers,
    })),
  };
}

/** The module's subject, after „Nie udało się nam sprawdzić”. */
export const POWER_SUBJECT = "przerw w dostawie prądu";

/**
 * The module's data, or null when there is no copy yet: then the address
 * page says it has not been checked. PGE's checks failing: its outages
 * and the notice; the store unreadable: the notice alone.
 */
export function power(
  copy: PgeRead,
  place: PlaceView,
  now: number,
): Power | null {
  if (!copy) return null;
  if (copy === UNREADABLE)
    return {
      place,
      cuts: [],
      notice: uncheckedText(POWER_SUBJECT),
      shown: false,
      changedAt: null,
    };
  const cuts = copy.feed.items.flatMap((item) => cutAt(item, place, now) ?? []);
  const live = cuts.filter((cut) => !cut.revoked).length;
  return {
    place,
    cuts,
    notice: liveNotice("danych PGE", copy.failingSince, now, live),
    shown: true,
    changedAt: copy.changedAt,
  };
}

/**
 * A range's span (lib/hub.ts span); a failure's end is an estimate. The
 * timeline's and the home panel's (lib/now-panel.ts).
 */
export const rangeSpan = (
  cut: Pick<PgeOutage, "kind">,
  r: PgeOutage["ranges"][number],
) =>
  span(warsawDay(Date.parse(r.start)), r.start, r.end, cut.kind === "failure");

/** The places here, by our names: „ul. Rynek i ul. Jasna”. */
const names = (cut: PowerCut) => LIST.format(cut.where.map((w) => w.name));

/**
 * The timeline's second sentence: where, and when PGE lists house numbers,
 * that only some are cut (the subpage lists them).
 */
function second(cut: PowerCut): string {
  const some = cut.where.some((w) => w.numbers !== null);
  return `${capitalised(names(cut))}${some ? ", tylko pod niektórymi numerami – sprawdź w szczegółach" : ""}.`;
}

/** The timeline's items: each range of each outage not revoked. */
export function powerUpcoming(data: Power): Item[] {
  return data.cuts
    .filter((cut) => !cut.revoked)
    .flatMap((cut) =>
      cut.ranges.map((r) => ({
        module: "prad" as const,
        span: rangeSpan(cut, r),
        emergency: cut.kind === "failure",
        second: second(cut),
      })),
    );
}

/** The notice, then where the current outages are: PGE's page. */
function noticeParts(notice: string): Part[] {
  return [
    `${notice} Aktualne znajdziesz na `,
    { href: PGE_PAGE, text: `stronie ${PGE_GENITIVE}` },
    ".",
  ];
}

/** The hub's power lines that belong to no day: the notice, else none. */
export function powerNotices(data: Power): Group[] {
  return data.notice ? [[noticeParts(data.notice)]] : [];
}

/** No outage here, from a copy we show. */
const NONE = `PGE nie podaje teraz żadnych ${POWER_SUBJECT} pod tym adresem.`;

const NO_NUMBERS = "PGE nie podaje numerów";

/** A cut without hours (PGE gives them, so a guard only). */
export const POWER_NO_HOURS = "PGE nie podaje godzin.";

/** „Numery domów według PGE”: as given; each place named when several. */
function numbers(cut: PowerCut): string {
  if (cut.where.length === 1) return cut.where[0].numbers ?? `${NO_NUMBERS}.`;
  return cut.where
    .map((w) => `${w.name}: ${w.numbers ?? NO_NUMBERS}`)
    .join("; ");
}

/**
 * The kind, a summary list row: its badge, a failure red; revoked, a
 * muted „Odwołana” and the kind in words, with PGE's note.
 */
function kindRow(cut: PowerCut) {
  const failure = cut.kind === "failure";
  const kind = failure ? "Awaria" : "Planowana przerwa";
  return cut.revoked
    ? {
        key: "Rodzaj",
        badge: { text: "Odwołana", tone: "muted" as const },
        value: [cut.revokedNote ? `${kind}. ${cut.revokedNote}` : kind],
      }
    : {
        key: "Rodzaj",
        badge: {
          text: kind,
          tone: failure ? ("alert" as const) : ("mod" as const),
        },
        value: [],
      };
}

/** The power's subpage as the outages' one shape (lib/outage-view.ts). */
export function powerPage(data: Power): OutagePage {
  const days = [
    ...new Set(
      data.cuts.flatMap((cut) => cut.ranges.map((r) => rangeSpan(cut, r).day)),
    ),
  ].sort();
  return {
    note: data.notice ? noticeParts(data.notice) : null,
    calendar: null,
    empty: data.shown && data.cuts.length === 0 ? [NONE] : null,
    days: days.map((date) => ({
      date,
      blocks: data.cuts.flatMap((cut) => {
        const spans = cut.ranges
          .map((r) => rangeSpan(cut, r))
          .filter((s) => s.day === date);
        if (spans.length === 0) return [];
        return [
          {
            key: `${cut.uuid}-${date}`,
            rows: [
              hoursRow(
                spans.map((s) => fromTo(s, false)),
                POWER_NO_HOURS,
              ),
              kindRow(cut),
              { key: "Gdzie", value: [names(cut)] },
              { key: "Numery domów według PGE", value: [numbers(cut)] },
            ],
          },
        ];
      }),
    })),
    others: [],
    aiNote: null,
    sources: powerSources(),
    changedAt: data.changedAt,
    cadence: "live",
  };
}

/** „Źródło: PGE Dystrybucja”, its public page of outages. */
export const powerSources = (): Part[][] => [
  [{ href: PGE_PAGE, text: PGE_NAME }],
];

/** /prad's description: the place, and whose data it is. */
export const powerDescription = (place: PlaceView) =>
  `Przerwy w dostawie prądu: ${place.label}. Daty i godziny według ${PGE_GENITIVE}.`;
