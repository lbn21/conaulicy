// The gmina-wide outage pages, /woda and /prad (app/woda, app/prad): every
// water cut and power outage of the whole gmina, in the outages' one shape
// (lib/outage-view.ts, drawn by components/outage-page.tsx), with the
// address subpages' rows, texts and rules: the same sources, the same
// "still shown" rule (lib/zuk.ts notOver, lib/power-module.ts liveRanges)
// and, for water, the home panel's count (lib/now-panel.ts waterInWindow:
// one card per post, day and hours, lib/water-module.ts postSlot). Pure,
// so the unit tests read every state.
//
// The view (lib/gmina-pages.ts) keeps only what the page renders: places
// by their TERYT ids (named here, from TERYT), never a check time
// (checkedAt, fetchedAt), so a check that changes nothing changes no
// digest (lib/page-refresh.ts). „Gdzie” names each place by TERYT, its
// locality first, the places of one locality together, in TERYT order;
// each place built in this deployment links to its own subpage
// (/adres/<id>/woda, /prad), any other is plain text, so no link 404s.

import { fromTo } from "../components/rows/when.ts";
import type { Disruption, Notice } from "./disruptions.ts";
import { hasSource } from "./event-source.ts";
import { merged, type Part, uncheckedText } from "./hub.ts";
import { liveNotice, UNREADABLE } from "./live-status.ts";
import { LIST } from "./locale.ts";
import type { SubpageId } from "./module-ids.ts";
import { hoursRow, type OutagePage } from "./outage-view.ts";
import type { PlaceRef } from "./place-match.ts";
import { placePath, streetName } from "./places.ts";
import {
  kindRow,
  liveRanges,
  NUMBERS_KEY,
  noticeParts,
  numbers,
  type PgeRead,
  POWER_NO_HOURS,
  POWER_SUBJECT,
  type PowerCut,
  powerNone,
  powerSources,
  rangeSpan,
  ref,
} from "./power-module.ts";
import {
  cutSpan,
  latest,
  NO_HOURS,
  noticeLink,
  placeWord,
  postSlot,
  type SourceState,
  staleNote,
  type WaterShown,
  waterAiNote,
  waterEmpty,
  waterSources,
} from "./water-module.ts";
import { WATER_SOURCES, type WaterSourceId } from "./water-sources.ts";
import type { ZukData } from "./zuk-data.ts";
import { ZUK_PLACES } from "./zuk-places.generated.ts";

/** Where the pages' empty power line says nothing is listed. */
const GMINA_WHERE = "w Lubaczowie ani w gminie";

// TERYT's places, in its order: the order „Gdzie” lists them in.
const LOCALITIES = new Map(ZUK_PLACES.localities.map((l, i) => [l.id, i]));
const STREETS = new Map(ZUK_PLACES.streets.map((s, i) => [s.id, i]));
const LOCALITY = new Map(ZUK_PLACES.localities.map((l) => [l.id, l]));
const STREET = new Map(ZUK_PLACES.streets.map((s) => [s.id, s]));

/** A locality by TERYT: a part with its village, „Holiki (Dąbrowa)”. */
function localityName(id: string): string {
  const locality = LOCALITY.get(id);
  if (!locality) return id;
  const parent = locality.parentId && LOCALITY.get(locality.parentId);
  return parent ? `${locality.name} (${parent.name})` : locality.name;
}

/** A street by TERYT: „ul. Rynek”; unknown, its id. */
function streetLabel(id: string): string {
  const street = STREET.get(id);
  return street ? streetName(street.cecha, street.name) : id;
}

/** A place's id as the address pages have it: its street, else locality. */
const placeId = (place: PlaceRef) => place.streetId ?? place.localityId;

/** A place by TERYT, its locality after a street: „ul. Rynek, Lubaczów”. */
const fullName = (place: PlaceRef) =>
  place.streetId
    ? `${streetLabel(place.streetId)}, ${localityName(place.localityId)}`
    : localityName(place.localityId);

/** TERYT order: by locality, the locality itself before its streets. */
const byTeryt = (a: PlaceRef, b: PlaceRef) =>
  (LOCALITIES.get(a.localityId) ?? 0) - (LOCALITIES.get(b.localityId) ?? 0) ||
  (a.streetId === null ? -1 : (STREETS.get(a.streetId) ?? 0)) -
    (b.streetId === null ? -1 : (STREETS.get(b.streetId) ?? 0));

/** Links as a list ("a, b i c"): Intl's words between them. */
const joined = (items: Part[][]): Part[] =>
  LIST.formatToParts(items.map((_, i) => String(i))).flatMap((part) =>
    part.type === "element" ? items[Number(part.value)] : [part.value],
  );

/**
 * „Gdzie” of an outage, gmina-wide: each locality's places together, in
 * TERYT order, the localities apart („; ”): the locality, linked when it
 * is itself cut, then its streets: „Lubaczów: ul. Rynek i ul. Jasna;
 * Basznia Dolna (cała wieś)”. `suffix`: what of the place is cut, after
 * its name; `link`: its subpage when built, else null.
 */
function where<P extends PlaceRef>(
  places: P[],
  suffix: (place: P) => string,
  link: (id: string) => string | null,
): Part[] {
  const named = (place: P, text: string): Part[] => {
    const href = link(placeId(place));
    return [href ? { href, text } : text, suffix(place)];
  };
  const groups = new Map<string, P[]>();
  for (const place of places.toSorted(byTeryt))
    groups.set(place.localityId, [
      ...(groups.get(place.localityId) ?? []),
      place,
    ]);
  return merged(
    [...groups].flatMap(([localityId, group], i) => {
      const own = group.find((p) => p.streetId === null);
      const streets = group.filter((p) => p.streetId !== null);
      const name = localityName(localityId);
      const head = own ? named(own, name) : [name];
      const tail =
        streets.length > 0
          ? [
              ": ",
              ...joined(
                streets.map((p) => named(p, streetLabel(p.streetId ?? ""))),
              ),
            ]
          : [];
      return [...(i > 0 ? ["; "] : []), ...head, ...tail];
    }),
  ).filter((part) => part !== "");
}

/** Its subpage, `slug`'s, when the place is in `built`; else null. */
const linker =
  (built: readonly string[], slug: SubpageId) =>
  (id: string): string | null =>
    built.includes(id) ? `${placePath(id)}/${slug}` : null;

/** Its PlaceRef ids, those this deployment built: the page's links. */
export const builtOf = (places: PlaceRef[], built: ReadonlySet<string>) =>
  [...new Set(places.map(placeId))].filter((id) => built.has(id)).sort();

// ——— Power ———

/** One of an outage's places: by TERYT ids, PGE's numbers as given. */
type PowerPlace = PlaceRef & { numbers: string | null };

type GminaPowerCut = Omit<PowerCut, "where"> & { where: PowerPlace[] };

/** The gmina's power, as /prad keeps it (lib/gmina-pages.ts). */
export type GminaPower = {
  /** Every outage still shown (liveRanges), in PGE's order; revoked too. */
  cuts: GminaPowerCut[];
  /** The copy is old or unreadable: what we say, before PGE's link. */
  notice: string | null;
  /** The copy is shown (the store could be read). */
  shown: boolean;
  /** When PGE's items last changed (ms); null: unknown. */
  changedAt: number | null;
};

/**
 * Every outage PGE lists in the gmina (its feed already cut to our TERYT
 * places, lib/pge-feed.ts ours) still shown at `now`, as the address
 * pages' rule (lib/power-module.ts power); null: no copy yet.
 */
export function gminaPower(copy: PgeRead, now: number): GminaPower | null {
  if (!copy) return null;
  if (copy === UNREADABLE)
    return {
      cuts: [],
      notice: uncheckedText(POWER_SUBJECT),
      shown: false,
      changedAt: null,
    };
  const cuts = copy.feed.items.flatMap((item) => {
    const ranges = liveRanges(item, now);
    if (ranges.length === 0) return [];
    return [
      {
        uuid: item.uuid,
        kind: item.kind,
        revoked: item.revoked,
        revokedNote: item.revokedNote,
        ranges,
        where: item.addresses.map((a) => ({ ...ref(a), numbers: a.numbers })),
      },
    ];
  });
  const live = cuts.filter((cut) => !cut.revoked).length;
  return {
    cuts,
    notice: liveNotice("danych PGE", copy.failingSince, now, live),
    shown: true,
    changedAt: copy.changedAt,
  };
}

/**
 * /prad's body (lib/outage-view.ts): a day each, a card per outage per
 * day, by start then PGE's id; the rows of the address's subpage
 * (lib/power-module.ts powerPage) with every place gmina-wide. `built`:
 * the place ids this deployment built, the links. null: no copy yet.
 */
export function gminaPowerPage(
  data: GminaPower | null,
  built: readonly string[],
): OutagePage {
  const link = linker(built, "prad");
  const blocks = (data?.cuts ?? []).flatMap((cut) =>
    [...new Set(cut.ranges.map((r) => rangeSpan(cut, r).day))].map((date) => {
      const spans = cut.ranges
        .map((r) => rangeSpan(cut, r))
        .filter((s) => s.day === date);
      return {
        date,
        start: spans[0].start,
        key: `${cut.uuid}-${date}`,
        rows: [
          hoursRow(
            spans.map((s) => fromTo(s, false)),
            POWER_NO_HOURS,
          ),
          kindRow(cut),
          { key: "Gdzie", value: where(cut.where, () => "", link) },
          {
            key: NUMBERS_KEY,
            value: [
              numbers(
                cut.where.map((w) => ({
                  name: fullName(w),
                  numbers: w.numbers,
                })),
              ),
            ],
          },
        ],
      };
    }),
  );
  return {
    note: data?.notice ? noticeParts(data.notice) : null,
    calendar: null,
    empty: !data
      ? [uncheckedText(POWER_SUBJECT)]
      : data.shown && data.cuts.length === 0
        ? [powerNone(GMINA_WHERE)]
        : null,
    // Soonest first; in a day, by start, then PGE's id.
    days: byDay(
      blocks.toSorted(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          Date.parse(a.start) - Date.parse(b.start) ||
          a.key.localeCompare(b.key),
      ),
    ),
    others: [],
    aiNote: null,
    sources: powerSources(),
    changedAt: data?.changedAt ?? null,
    cadence: "live",
  };
}

type Block = OutagePage["days"][number]["blocks"][number];

/** Blocks by their day, in the order given, the days in that order too. */
function byDay(blocks: Array<Block & { date: string }>): OutagePage["days"] {
  const days = new Map<string, Block[]>();
  for (const { date, key, rows } of blocks)
    days.set(date, [...(days.get(date) ?? []), { key, rows }]);
  return [...days].map(([date, blocks]) => ({ date, blocks }));
}

// ——— Water ———

/** A post's link, never its check time. */
type PostSource = { url: string };

/** One place of a water cut: TERYT ids and what of it is cut. */
type WaterPlace = Pick<Disruption, "place" | "scope" | "note">;

/**
 * One cut gmina-wide: one post's day and hours (postSlot), every place it
 * names then; the first place's uid stands for it.
 */
type WaterCard = Pick<
  Disruption,
  "uid" | "date" | "start" | "end" | "endEstimated" | "publishedAt"
> & { source: PostSource; places: WaterPlace[] };

type GminaNotice = Pick<
  Notice,
  "uid" | "title" | "publishedAt" | "where" | "doubt"
> & { source: PostSource };

/** One source's state, by its id (plain JSON, lib/page-cache.ts). */
type SourceRead = { id: WaterSourceId } & Omit<SourceState, "source">;

/** The gmina's water, as /woda keeps it (lib/gmina-pages.ts). */
export type GminaWater = {
  /** By day, start, post and first place. */
  cards: WaterCard[];
  /** Every post we could not read safely, once each. */
  notices: GminaNotice[];
  sources: SourceRead[];
};

const wholeLocality = (p: WaterPlace) =>
  p.place.streetId === null && p.scope.type === "whole";

/**
 * Every source's cuts and notices, gmina-wide (each already cut to what is
 * not over, lib/zuk-data.ts zukView; with a source, lib/event-source.ts):
 * one card per post, day and hours (postSlot), its places once each, and
 * no street of a locality the card cuts whole. A source missing from
 * `views` has no file.
 */
export function gminaWater(
  views: Partial<Record<WaterSourceId, ZukData>>,
): GminaWater {
  const cards = new Map<string, WaterCard>();
  const notices = new Map<string, GminaNotice>();
  const sources: SourceRead[] = [];
  for (const source of WATER_SOURCES) {
    const view = views[source.id];
    sources.push({
      id: source.id,
      changedAt: view?.changedAt ?? null,
      stale: view?.stale ?? true,
      unavailable: view?.unavailable ?? true,
    });
    if (!view) continue;
    const sourced = (item: Disruption | Notice) =>
      hasSource({ sourceUrl: item.source.url, checkedAt: view.checkedAt });
    for (const cut of view.disruptions.filter(sourced)) {
      const key = postSlot(cut);
      const card = cards.get(key) ?? {
        uid: cut.uid,
        date: cut.date,
        start: cut.start,
        end: cut.end,
        endEstimated: cut.endEstimated,
        publishedAt: cut.publishedAt,
        source: { url: cut.source.url },
        places: [],
      };
      cards.set(key, card);
      const same = (p: WaterPlace) =>
        p.place.localityId === cut.place.localityId &&
        p.place.streetId === cut.place.streetId;
      if (!card.places.some(same))
        card.places.push({
          place: cut.place,
          scope: cut.scope,
          note: cut.note,
        });
    }
    for (const notice of view.notices.filter(sourced))
      if (!notices.has(notice.uid))
        notices.set(notice.uid, {
          uid: notice.uid,
          title: notice.title,
          publishedAt: notice.publishedAt,
          ...(notice.where && { where: notice.where }),
          ...(notice.doubt && { doubt: notice.doubt }),
          source: { url: notice.source.url },
        });
  }
  const shown = [...cards.values()].map((card) => {
    const whole = new Set(
      card.places.filter(wholeLocality).map((p) => p.place.localityId),
    );
    return {
      ...card,
      places: card.places
        .filter(
          (p) => p.place.streetId === null || !whole.has(p.place.localityId),
        )
        .toSorted((a, b) => byTeryt(a.place, b.place)),
    };
  });
  return {
    cards: shown.toSorted(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.start ?? "").localeCompare(b.start ?? "") ||
        a.source.url.localeCompare(b.source.url) ||
        placeId(a.places[0].place).localeCompare(placeId(b.places[0].place)),
    ),
    notices: [...notices.values()],
    sources,
  };
}

/** Every place id a page of the gmina's water names. */
export const waterPlaces = (data: GminaWater): PlaceRef[] =>
  data.cards.flatMap((card) => card.places.map((p) => p.place));

/** Every place id a page of the gmina's power names. */
export const powerPlaces = (data: GminaPower | null): PlaceRef[] =>
  (data?.cuts ?? []).flatMap((cut) => cut.where);

/**
 * What of a place is cut, after its name: a whole locality its word
 * („ (cała wieś)”), a whole street nothing, else the houses: the source's
 * note as written, the ranges or numbers, or „w części”.
 */
function waterSuffix({ place, scope, note }: WaterPlace): string {
  if (scope.type === "whole" && !note)
    return place.streetId === null
      ? ` (cała ${placeWord(place.localityId).is})`
      : "";
  if (note) return ` (${note})`;
  if (scope.type === "ranges")
    return ` (numery ${LIST.format(scope.ranges.map((r) => `od ${r.from} do ${r.to}`))})`;
  if (scope.type === "numbers") return ` (numery ${scope.numbers.join(", ")})`;
  return " (w części)";
}

/** The texts' view of the gmina's water: every source, by its state. */
function shownOf(data: GminaWater): WaterShown {
  return {
    outages: data.cards,
    notices: data.notices,
    sources: data.sources.flatMap(({ id, ...state }) => {
      const source = WATER_SOURCES.find((s) => s.id === id);
      return source ? [{ source, ...state }] : [];
    }),
  };
}

/**
 * /woda's body (lib/outage-view.ts): the stale note, a day each, a card
 * per post, day and hours, „Inne komunikaty”, the AI-read note when a cut
 * is shown, and the posts as the source; the address's subpage's texts
 * (components/water-page.tsx) for every source. `built`: the links.
 */
export function gminaWaterPage(
  data: GminaWater,
  built: readonly string[],
): OutagePage {
  const shown = shownOf(data);
  const empty = waterEmpty(shown);
  const link = linker(built, "woda");
  const blocks = data.cards.map((card) => ({
    date: card.date,
    key: postSlot(card),
    rows: [
      hoursRow([fromTo(cutSpan(card), false)], NO_HOURS),
      {
        key: "Gdzie",
        value: where(
          card.places.map((p) => ({ ...p.place, ...p })),
          waterSuffix,
          link,
        ),
      },
    ],
  }));
  return {
    note: staleNote(shown),
    calendar: null,
    empty,
    days: byDay(blocks),
    others: data.notices.map((notice) => ({
      key: notice.uid,
      parts: [noticeLink(notice)],
    })),
    aiNote: empty ? null : waterAiNote(shown),
    sources: waterSources(shown),
    changedAt: latest(data.sources.map((s) => s.changedAt)),
    cadence: "water",
  };
}
