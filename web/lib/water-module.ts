// What the water module (lib/modules.ts) says about a place: the planned
// water cuts its sources announce (lib/water-sources.ts: the gmina's posts
// everywhere, MZGKiM's in the town and its parts), those at this address
// only, from each source's file (lib/zuk-data.ts zukView). One logic and
// one set of texts for every address: only its list of sources differs.
// Pure, so the unit tests read every state.
//
// Matching, from the data alone: a cut applies when its locality is the
// address's locality and it names no street (the whole locality) or this
// street. A village's own page also gets the cuts on some of its streets,
// one per post, day and hours, the streets named (`Cut.streets`, „w części
// miejscowości”); never a parent's streets. A village part (a TERYT part
// with a parent) also gets every cut of its village that names no street:
// the whole village plainly, anything less „w części miejscowości” with
// the village named and a hint to check its page, as we cannot tell
// whether the part is in it. A part whose addresses are all on a street of
// its village (lib/part-streets.ts) gets that street's cuts too. Notices
// (posts we could not read safely) are matched by the localities the gate
// found in them, the part's village included; a post read but for some
// places (Notice `where`) is linked only where none of its cuts is shown.
//
// With a house number, a cut by house ranges or numbers that clearly leaves
// it out is not shown (outsideRange), and the page says one was left out;
// one that clearly includes it says so („pod nr 44”). Anything we cannot
// compare (no number, parity, "w części", an odd bound, a village's range
// where its streets number on their own) is always shown. Only a cut on
// the address's own locality is compared at all: its own street, or its
// own village with no streets. A cut that reaches it from elsewhere (its
// village's, a linked street's, a village's grouped streets) is never
// hidden for a number and never certain for one.
//
// Each source's file is fresh, stale (last read over an hour ago) or
// unavailable (none): the texts say which, naming the sources only when
// not all of an address's sources are in that state.
import type { PlaceView } from "@/lib/schedule";
import { longDate } from "./date-labels.ts";
import { absoluteDay, warsawToIso } from "./dates.ts";
import type { Disruption, Notice } from "./disruptions.ts";
import { capitalised, type Group, merged, type Part, span } from "./hub.ts";
import { PART_STREETS, VILLAGE_IN } from "./part-streets.ts";
import { placePath } from "./places.ts";
import type { Item } from "./upcoming.ts";
import {
  GMINA,
  sourceOf,
  sourcesAt,
  type WaterSource,
  type WaterSourceId,
} from "./water-sources.ts";
import { endInstant } from "./zuk.ts";
import { type ZukData, zukView } from "./zuk-data.ts";
import { ZUK_PLACES } from "./zuk-places.generated.ts";

export { GMINA_NEWS, MZGKIM_NEWS } from "./water-sources.ts";

/** One source of the address, as its file stands. */
type SourceState = {
  source: WaterSource;
  /** The source's last read; null without a file. */
  checkedAt: string | null;
  /** Last read over an hour ago, or no file. */
  stale: boolean;
  /** No file, or an unreadable one. */
  unavailable: boolean;
};

/** A street of a village's grouped cut, with its houses as written. */
type CutStreet = { id: string; name: string; note: string | null };

/**
 * A cut as the pages show it; on a village's own page, the cuts on some of
 * its streets of one post, day and hours as one, its `streets` in the
 * post's order.
 */
export type Cut = Disruption & { streets?: CutStreet[] };

export type Water = {
  place: PlaceView;
  /** Cuts still to come here, the soonest first, one per day and hours. */
  outages: Cut[];
  /** Cuts here left out for the house number as given (outsideRange). */
  hidden: Cut[];
  hiddenForNr: boolean;
  /** Water posts we could not read safely that may concern this locality. */
  notices: Notice[];
  /** The sources that announce cuts here, in order (sourcesAt). */
  sources: SourceState[];
  /** The oldest last read of the sources with a file; null if none has. */
  checkedAt: string | null;
  /** Some source last read over an hour ago, or without a file. */
  stale: boolean;
  /** No source has a file. */
  unavailable: boolean;
};

type Address = Pick<PlaceView, "localityId" | "streetId">;

/** Each village part's village (the town's parts among them). */
const PARENT = new Map<string, string>();
for (const l of ZUK_PLACES.localities)
  if (l.parentId) PARENT.set(l.id, l.parentId);

/** Whether a cut applies to the address (see the top of this file). */
export function matches(address: Address, cut: Disruption): boolean {
  const { localityId, streetId } = cut.place;
  if (localityId === address.localityId)
    return (
      streetId === null ||
      address.streetId === null ||
      streetId === address.streetId
    );
  if (streetId === null) return localityId === PARENT.get(address.localityId);
  return (
    address.streetId === null &&
    (PART_STREETS.get(address.localityId)?.includes(streetId) ?? false)
  );
}

/** A cut on the address's own locality: the only one a number can filter. */
const own = (cut: Disruption, address: Address) =>
  cut.place.localityId === address.localityId;

/** Localities with streets of their own (the town among them). */
const STREETED = new Set(ZUK_PLACES.streets.map((s) => s.localityId));

/**
 * Where the house number falls in the cut's houses: "inside", "outside", or
 * null when we cannot tell. Compared on whole numbers only ("30a" is inside
 * 23–47, "7/22" is 7 and 22, either inside is enough); a village's range
 * where the village has streets, any scope but ranges or numbers, or
 * anything that does not parse: null.
 */
function houseFit(cut: Cut, nr: string | null): "inside" | "outside" | null {
  if (nr === null || cut.streets) return null;
  if (cut.place.streetId === null && STREETED.has(cut.place.localityId))
    return null;
  const parts = (nr.match(/\d+/g) ?? []).map(Number);
  const { scope } = cut;
  const spans =
    scope.type === "ranges"
      ? scope.ranges.map((r) => [r.from, r.to])
      : scope.type === "numbers"
        ? scope.numbers.map((n) => [n, n])
        : [];
  const bounds = spans.map((span) => span.map((b) => Number.parseInt(b, 10)));
  if (parts.length === 0 || bounds.length === 0) return null;
  if (bounds.flat().some(Number.isNaN)) return null;
  return parts.some((p) => bounds.some(([from, to]) => from <= p && p <= to))
    ? "inside"
    : "outside";
}

/** Whether the house number is clearly outside the cut's houses (houseFit). */
export function outsideRange(cut: Cut, nr: string | null): boolean {
  return houseFit(cut, nr) === "outside";
}

const wholeLocality = (cut: Disruption) =>
  cut.place.streetId === null && cut.scope.type === "whole";

const slot = (cut: Disruption) => `${cut.date}|${cut.start}|${cut.end}`;

/** "zuk-39885-2026-10-27-…" → "zuk-39885": the source's post. */
const postOf = (cut: Disruption) => /^[a-z]+-\d+/.exec(cut.uid)?.[0] ?? cut.uid;

/**
 * On a village's own page, its streets' cuts of one post, day, hours and
 * cause as one cut, where the first of them was, the streets named; none
 * where the post cuts the village itself then, in any scope (the gate's
 * copies of a village's cut on its streets).
 */
function grouped(address: Address, cuts: Disruption[]): Cut[] {
  if (address.streetId !== null) return cuts;
  const at = (cut: Disruption) => `${postOf(cut)}|${slot(cut)}`;
  const village = new Set(
    cuts
      .filter(
        (cut) =>
          cut.place.localityId === address.localityId &&
          cut.place.streetId === null,
      )
      .map(at),
  );
  const groups = new Map<string, Cut & { streets: CutStreet[] }>();
  const out: Cut[] = [];
  for (const cut of cuts) {
    const { localityId, streetId } = cut.place;
    if (localityId !== address.localityId || streetId === null) {
      out.push(cut);
      continue;
    }
    if (village.has(at(cut))) continue;
    const key = `${at(cut)}|${cut.cause}`;
    let group = groups.get(key);
    if (!group) {
      const hhmm = (cut.start ?? "").slice(11, 16).replace(":", "");
      group = {
        ...cut,
        uid: `${cut.uid}-ulice-${cut.cause}-${hhmm}`,
        place: { localityId, streetId: null },
        ...(cut.label && { label: { ...cut.label, street: null } }),
        scope: { type: "unknown" },
        note: null,
        streets: [],
      };
      groups.set(key, group);
      out.push(group);
    }
    if (!group.streets.some((s) => s.id === streetId))
      group.streets.push({
        id: streetId,
        name: cut.label?.street ?? cut.where,
        note: cut.note,
      });
  }
  return out;
}

/**
 * The cuts at the address: the soonest first, and where the whole locality
 * is cut, not again for its street on the same day and hours; on a
 * village's page, its streets' cuts grouped (grouped).
 */
function atAddress(address: Address, cuts: Disruption[]): Cut[] {
  const found = cuts
    .filter((cut) => matches(address, cut))
    .toSorted(
      (a, b) =>
        slot(a).localeCompare(slot(b)) ||
        Number(wholeLocality(b)) - Number(wholeLocality(a)),
    );
  const whole = new Set<string>();
  const uids = new Set<string>();
  const kept = found.filter((cut) => {
    if (uids.has(cut.uid) || whole.has(slot(cut))) return false;
    uids.add(cut.uid);
    if (wholeLocality(cut)) whole.add(slot(cut));
    return true;
  });
  return grouped(address, kept);
}

/** No file: what a source without one gives (zukView). */
const NONE = zukView(null, new Date(0));

/**
 * The module's data for a place, from each source's data (what the pages
 * get of its file); a source missing from `views` has no file.
 */
export function water(
  views: Partial<Record<WaterSourceId, ZukData>>,
  place: PlaceView,
): Water {
  const states = sourcesAt(place.localityId).map((source) => {
    const view = views[source.id] ?? NONE;
    return { source, view };
  });
  const here = atAddress(
    place,
    states.flatMap(({ view }) => view.disruptions),
  );
  const village = PARENT.get(place.localityId);
  const left = (cut: Cut) =>
    own(cut, place) && outsideRange(cut, place.givenNr);
  const outages = here.filter((cut) => !left(cut));
  const hidden = here.filter(left);
  const shownPosts = new Set(outages.map((cut) => cut.source.url));
  const sources = states.map(({ source, view }) => ({
    source,
    checkedAt: view.checkedAt,
    stale: view.stale,
    unavailable: view.unavailable,
  }));
  const checked = sources
    .map((s) => s.checkedAt)
    .filter((at): at is string => at !== null)
    .sort();
  return {
    place,
    outages,
    hidden,
    hiddenForNr: hidden.length > 0,
    notices: states
      .flatMap(({ view }) => view.notices)
      .flatMap((notice) => {
        // A doubt only on the streets of the district it may mean, naming
        // only that district's words.
        if (!notice.doubt) return [notice];
        const here = notice.doubt.filter(
          (d) =>
            place.streetId !== null && d.streetIds.includes(place.streetId),
        );
        return here.length > 0 ? [{ ...notice, doubt: here }] : [];
      })
      .filter(
        (notice) =>
          notice.localityIds.some(
            (id) => id === place.localityId || id === village,
          ) &&
          !(
            (notice.where || notice.doubt) &&
            shownPosts.has(notice.source.url)
          ),
      ),
    sources,
    checkedAt: checked[0] ?? null,
    stale: sources.some((s) => s.stale),
    unavailable: sources.every((s) => s.unavailable),
  };
}

/** The water subpage, with the house number as given. */
export function waterPath(place: Pick<PlaceView, "id" | "givenNr">): string {
  return `${placePath(place.id)}/woda${place.givenNr ? `?nr=${place.givenNr}` : ""}`;
}

/** "08:00:00" of a wall time as "8:00". */
const clock = (wall: string) => wall.slice(11, 16).replace(/^0/, "");

/** "8:00–16:00", "od 8:00", "22:00 – wtorek, 27 października, 4:00"; or null. */
export function hours(cut: Disruption): string | null {
  const { start, end } = cut;
  const about = cut.endEstimated ? "ok. " : "";
  if (!end) return start ? `od ${clock(start)}` : null;
  const endDay = end.slice(0, 10);
  const until =
    endDay === cut.date
      ? `${about}${clock(end)}`
      : `${absoluteDay(endDay)}, ${about}${clock(end)}`;
  if (!start) return `do ${until}`;
  return endDay === cut.date
    ? `${clock(start)}–${until}`
    : `${clock(start)} – ${until}`;
}

/** The day and hours: "wtorek, 27 października, 8:00–16:00". */
function when(cut: Cut): string {
  const time = hours(cut);
  return `${absoluteDay(cut.date)}${time ? `, ${time}` : ""}`;
}

/** "a", "a i b", "a, b i c". */
const listed = (items: string[]) =>
  items.length > 1
    ? `${items.slice(0, -1).join(", ")} i ${items.at(-1)}`
    : (items[0] ?? "");

/** TERYT's kind of each locality (SIMC). */
const KIND = new Map(ZUK_PLACES.localities.map((l) => [l.id, l.kind]));

/**
 * The word for a whole locality, from its TERYT kind: „wieś” (genitive
 * „wsi”) for a village, „miejscowość” („miejscowości”) for anything else.
 * One rule for the Woda section (scope) and „Najbliższe dni”.
 */
function placeWord(localityId: string): { is: string; of: string } {
  return KIND.get(localityId) === "wies"
    ? { is: "wieś", of: "wsi" }
    : { is: "miejscowość", of: "miejscowości" };
}

/**
 * What is cut, in our names, with the source's own words on the houses as
 * written: "cała wieś Wzorowo", "cała ulica Próbna", "Wzorowo:
 * Górki od numeru 44 do numeru 92", "część wsi Wzorowo: ulice
 * Próbna i Górna (od nr 26 do nr 42)".
 */
export function scope(cut: Cut): string {
  const label = cut.label;
  const street = label?.street ?? null;
  const name = street ? `ulica ${street}` : (label?.locality ?? cut.where);
  if (cut.streets) {
    const names = cut.streets.map((s) =>
      s.note ? `${s.name} (${s.note})` : s.name,
    );
    return `część ${placeWord(cut.place.localityId).of} ${label?.locality ?? cut.where}: ${names.length === 1 ? "ulica" : "ulice"} ${listed(names)}`;
  }
  if (cut.scope.type === "whole" && !cut.note) {
    return street
      ? `cała ulica ${street}`
      : `cała ${placeWord(cut.place.localityId).is} ${label?.locality ?? cut.where}`;
  }
  if (cut.note) return `${name}: ${cut.note}`;
  if (cut.scope.type === "ranges") {
    const ranges = cut.scope.ranges.map((r) => `od ${r.from} do ${r.to}`);
    return `${name}: numery ${ranges.join(" i ")}`;
  }
  if (cut.scope.type === "numbers")
    return `${name}: numery ${cut.scope.numbers.join(", ")}`;
  return `${name}, w części`;
}

/** The whole place, nothing more: certain wherever it applies. */
const certain = (cut: Cut) => cut.scope.type === "whole" && !cut.note;

/** The address's own cut that clearly includes the number as given. */
const inside = (cut: Cut, place: Water["place"]) =>
  own(cut, place) && houseFit(cut, place.givenNr) === "inside";

/**
 * A cut of the address's village that may leave its part out: the
 * village's name, else null.
 */
export function parentPart(cut: Cut, place: Address): string | null {
  if (certain(cut) || cut.place.streetId !== null) return null;
  if (cut.place.localityId !== PARENT.get(place.localityId)) return null;
  return cut.label?.locality ?? cut.where;
}

/**
 * What a part's page says of its village's cut that may leave it out:
 * "Czarne należy do miejscowości Załuże, a komunikat dotyczy tylko jej
 * części. Sprawdź, czy obejmuje Twój dom."
 */
export function parentHint(name: string, parent: string): string {
  return `${name} należy do miejscowości ${parent}, a komunikat dotyczy tylko jej części. Sprawdź, czy obejmuje Twój dom.`;
}

/** A street of the part's village it is on (lib/part-streets.ts). */
const linked = (cut: Cut, place: Address) =>
  cut.place.streetId !== null && !own(cut, place);

/**
 * „Gdzie”: scope, and the number as given when the cut clearly has it; on
 * a part, a street of its village with the village: "ulica Pilipy w
 * Młodowie". A number the register does not have (invalidNr), beside a cut
 * of only some houses: that we cannot tell whether it has the house.
 */
export function cutWhere(cut: Cut, place: Water["place"]): string {
  const where = placeWhere(cut, place);
  if (place.invalidNr === null || certain(cut)) return where;
  return `${where}. Nr „${place.invalidNr}” nie ma w rejestrze adresów, więc nie wiemy, czy ta przerwa obejmuje Twój dom`;
}

function placeWhere(cut: Cut, place: Water["place"]): string {
  if (inside(cut, place)) return `${scope(cut)} (obejmuje nr ${place.givenNr})`;
  if (!linked(cut, place) || !cut.label) return scope(cut);
  const { locality, street } = cut.label;
  const named = `${street} ${VILLAGE_IN.get(cut.place.localityId) ?? `w miejscowości ${locality}`}`;
  if (certain(cut)) return `ulica ${named}`;
  return scope({ ...cut, label: { ...cut.label, street: named } });
}

/** „44–92 i 100–110”, „3, 5, 7”: the houses as the scope has them. */
function houses(cut: Cut): string | null {
  const { scope } = cut;
  if (scope.type === "ranges")
    return scope.ranges.map((r) => `${r.from}–${r.to}`).join(" i ");
  if (scope.type === "numbers") return scope.numbers.join(", ");
  return null;
}

/**
 * The block's second sentence: where, from structured fields only (the
 * scope, our TERYT names and kinds, the grouped streets' names); never the
 * source's own words (`note`), whose presence only keeps it from „Cała”.
 */
function upcomingWhere(cut: Cut, place: Water["place"]): string {
  const word = placeWord(cut.place.localityId);
  const locality = cut.label?.locality ?? cut.where;
  const street = cut.label?.street ?? null;
  if (cut.streets)
    return `${cut.streets.length === 1 ? "Ulica" : "Ulice"} ${listed(cut.streets.map((s) => s.name))}.`;
  const parent = parentPart(cut, place);
  if (parent)
    return `Część ${word.of} ${parent} – może nie obejmować tej miejscowości. Sprawdź niżej.`;
  if (inside(cut, place)) return `Obejmuje Twój dom (nr ${place.givenNr}).`;
  if (certain(cut))
    return street ? `Cała ulica ${street}.` : `Cała ${word.is} ${locality}.`;
  const nrs = houses(cut);
  if (nrs) return `${street ? `Ulica ${street}` : locality}, numery ${nrs}.`;
  return `Część ${street ? "ulicy" : word.of} – sprawdź niżej, których domów dotyczy.`;
}

/** The block's items: every cut still to come here, each its own. */
export function waterUpcoming(data: Water): Item[] {
  return data.outages.map((cut) => ({
    module: "woda",
    span: span(
      cut.date,
      cut.start && warsawToIso(cut.start),
      endInstant(cut),
      cut.endEstimated,
    ),
    shownFrom: null,
    emergency: cut.cause === "emergency",
    second: upcomingWhere(cut, data.place),
    secondUntil: null,
  }));
}

/**
 * "Gmina ogłosiła przerwę …": a link to each post we could not read; for
 * a post read but for some places, those places as written.
 */
export function noticeLink(notice: Notice): Part {
  const { who, announced } = sourceOf(notice.uid);
  const doubt = notice.doubt ?? [];
  if (doubt.length > 0) {
    const one = doubt.length === 1;
    return {
      href: notice.source.url,
      text: `${who} pisze tylko ${doubt.map((d) => `„${d.words}”`).join(" i ")}, więc nie wiemy na pewno, czy chodzi o ${one ? "ulicę, czy o całe osiedle" : "ulice, czy o całe osiedla"} – zajrzyj do komunikatu`,
      hidden: `„${notice.title}”`,
    };
  }
  const where = notice.where ?? [];
  if (where.length === 0)
    return {
      href: notice.source.url,
      text: `${who} ${announced} przerwę w dostawie wody, której nie umiemy dopasować do adresów – sprawdź komunikat`,
      hidden: `„${notice.title}”`,
    };
  const places =
    where.length === 1 ? "w miejscu, którego" : "w miejscach, których";
  return {
    href: notice.source.url,
    text: `${who} ${announced} też przerwę ${places} nie umiemy dopasować do adresów: ${where.map((w) => `„${w}”`).join(", ")} – sprawdź komunikat`,
    hidden: `„${notice.title}”`,
  };
}

/** Links joined with „ i ”. */
const joined = (links: Part[]): Part[] =>
  links.flatMap((link, i) => (i === 0 ? [link] : [" i ", link]));

/** Some, not all, of the address's sources: then the texts name them. */
const named = (data: Water, some: SourceState[]) =>
  some.length < data.sources.length
    ? ` ${some.map((s) => s.source.of).join(" i ")}`
    : "";

const down = (data: Water) => data.sources.filter((s) => s.unavailable);
const late = (data: Water) =>
  data.sources.filter((s) => s.stale && !s.unavailable);

/**
 * Over an hour since a source was last read: its posts, to be sure; and,
 * beside a cut or a notice, a source we could not read at all.
 */
export function staleNote(data: Water): Part[] | null {
  const parts: Part[] = [];
  const old = late(data);
  if (old.length > 0)
    parts.push(
      `Od ponad godziny nie udało się nam sprawdzić nowych komunikatów${named(data, old)}. Zajrzyj też do `,
      ...joined(old.map((s) => s.source.newsOf)),
      ".",
    );
  const none = down(data);
  if (
    none.length > 0 &&
    none.length < data.sources.length &&
    data.outages.length + data.notices.length > 0
  )
    parts.push(
      `${parts.length > 0 ? " " : ""}Nie udało się nam teraz sprawdzić komunikatów${named(data, none)}. Zajrzyj też do `,
      ...joined(none.map((s) => s.source.newsOf)),
      ".",
    );
  return parts.length > 0 ? merged(parts) : null;
}

/** "w tej miejscowości" or "na tej ulicy": the address's place. */
const placeWords = (data: Water) =>
  data.place.streetId === null ? "w tej miejscowości" : "na tej ulicy";

/**
 * The section's lines: the nearest cut's day and hours and where, any more
 * days, a cut here left out for the house number, notices, the stale note;
 * with nothing, that nothing is announced (waterNone). Labels with a colon
 * end without a full stop: `where` may end in the source's own words.
 */
export function waterStatus(data: Water): Group[] {
  const [next, ...rest] = data.outages;
  const [left] = data.hidden;
  const groups: Group[] = [];
  if (next) {
    groups.push([
      [{ day: next.date, text: when(next) }],
      [`Gdzie: ${cutWhere(next, data.place)}`],
    ]);
    const parent = parentPart(next, data.place);
    if (parent)
      groups.push([
        [
          `${parentHint(data.place.name, parent)} Zobacz `,
          {
            href: placePath(next.place.localityId),
            text: `stronę miejscowości ${parent}`,
          },
          ".",
        ],
      ]);
    const later = rest.filter((cut) => cut.date !== next.date);
    if (later.length > 0)
      groups.push([
        [
          `Kolejne dni: ${[...new Set(later.map((cut) => absoluteDay(cut.date)))].join("; ")}`,
        ],
      ]);
    const trace = waterTrace(data);
    if (trace) groups.push([[trace]]);
  } else if (left) {
    const { who, foretold } = sourceOf(left.uid);
    const nr = data.place.givenNr;
    groups.push(
      [[`Pod nr ${nr}: ${waterNone(data)}.`]],
      [
        [
          `${who} ${foretold} przerwę ${placeWords(data)} – ${when(left)} – ale według komunikatu nie obejmuje nr ${nr}.`,
        ],
      ],
    );
  } else if (data.notices.length === 0) {
    groups.push([[`${capitalised(waterNone(data))}.`]]);
  }
  for (const notice of data.notices) groups.push([[noticeLink(notice)]]);
  // With nothing but the number's lines, the first says it (waterNone).
  const note = next || data.notices.length > 0 ? staleNote(data) : null;
  if (note) groups.push([note]);
  return groups;
}

/** The sources of the cuts shown, in the address's order. */
const cutSources = (data: Water) => {
  const used = new Set(data.outages.map((cut) => sourceOf(cut.uid).id));
  return data.sources
    .map((s) => s.source)
    .filter((source) => used.has(source.id));
};

/** The gmina's AI-read note: the shape of every source's. */
export const WATER_AI_NOTE =
  "Te daty przepisał automatycznie program. Jeśli coś się nie zgadza, ważniejszy jest komunikat gminy.";

/** The AI-read note for one source's posts, `of` its genitive. */
export function aiNote(of: string): string {
  return `Te daty przepisał automatycznie program. Jeśli coś się nie zgadza, ważniejszy jest komunikat ${of}.`;
}

/**
 * The subpage's AI-read note (components/subpage-parts.tsx AiReadNote), as
 * the waste schedule's (lib/schedule-notes.ts UNVERIFIED_NOTE): the posts
 * of the cuts shown.
 */
export function waterAiNote(data: Water): string {
  const used = cutSources(data);
  if (used.length > 1)
    return `Te daty przepisał automatycznie program. Jeśli coś się nie zgadza, ważniejsze są komunikaty ${used.map((s) => s.of).join(" i ")}.`;
  return aiNote((used[0] ?? GMINA).of);
}

/** The calendar block's hint: whose change of hours to fetch it again for. */
export function waterCalendarHint(data: Water): string {
  const used = cutSources(data);
  const who = (used.length > 0 ? used : [GMINA])
    .map((s) => s.inline)
    .join(" lub ");
  return `Plik z przerwami. Jeśli ${who} zmieni godziny, pobierz go jeszcze raz.`;
}

/** No cut announced: one phrase for the subpage and the address page. */
const NO_CUTS = "Brak zapowiedzianych przerw";

/** Where the sources announce cuts: "Gmina ogłasza je w …, a MZGKiM – w …". */
const announced = (sources: SourceState[]): Part[] =>
  sources.flatMap(({ source }, i) =>
    i === 0 ? source.announces : [", a ", ...source.announcesToo],
  );

/**
 * The subpage with no cut here: why, then where each source announces
 * cuts; a source we could not read named, with its posts; else null.
 */
export function waterEmpty(data: Water): Part[] | null {
  if (data.outages.length > 0) return null;
  const none = down(data);
  if (none.length === data.sources.length)
    return merged([
      "Nie udało się nam teraz sprawdzić komunikatów o wodzie. Zajrzyj do ",
      ...joined(data.sources.map((s) => s.source.newsOf)),
      ".",
    ]);
  const parts: Part[] = [
    `${NO_CUTS}. `,
    ...announced(data.sources.filter((s) => !s.unavailable)),
    ".",
  ];
  // With a notice, the note above says it (staleNote).
  if (none.length > 0 && data.notices.length === 0)
    parts.push(
      ` Nie udało się nam jednak teraz sprawdzić komunikatów${named(data, none)}. Zajrzyj do `,
      ...joined(none.map((s) => s.source.newsOf)),
      ".",
    );
  return merged(parts);
}

/** After the cuts or the empty text: a cut here left out for the number. */
export function waterTrace(data: Water): string | null {
  const [cut] = data.hidden;
  if (!cut) return null;
  const { who, foretold } = sourceOf(cut.uid);
  return `${who} ${foretold} też przerwę ${placeWords(data)}, ale według komunikatu nie obejmuje nr ${data.place.givenNr}.`;
}

/** Nothing to show: none announced, or we could not check (lowercase). */
export function waterNone(data: Water): string {
  const none = down(data);
  if (none.length > 0)
    return `nie udało się nam sprawdzić komunikatów${named(data, none)}`;
  const old = late(data);
  if (old.length > 0)
    return `brak zapowiedzianych przerw przy ostatnim sprawdzeniu, ale od ponad godziny nie udało się nam sprawdzić nowych${old.length < data.sources.length ? ` komunikatów${named(data, old)}` : ""}`;
  return NO_CUTS.toLowerCase();
}

/** The post itself, after „Źródło: ”: "komunikat gminy z 23 października 2026". */
function postLink(item: Pick<Disruption, "uid" | "source" | "publishedAt">) {
  return {
    href: item.source.url,
    text: `komunikat ${sourceOf(item.uid).of} z ${longDate(item.publishedAt.slice(0, 10))}`,
  };
}

/**
 * „Źródło”: each post a cut or notice here comes from (only its own post,
 * never another source's page); without one, each source's posts. When it
 * was checked: the module's checked line.
 */
export function waterSources(data: Water): Part[][] {
  const posts = new Map<string, Part>();
  for (const item of [...data.outages, ...data.notices])
    if (!posts.has(item.source.url)) posts.set(item.source.url, postLink(item));
  if (posts.size > 0) return [...posts.values()].map((link) => [link]);
  return data.sources.map((s) => [s.source.news]);
}

/** The oldest last read of the sources with a file; null if none has. */
export function waterChecked(data: Water): Date | null {
  return data.checkedAt ? new Date(data.checkedAt) : null;
}
