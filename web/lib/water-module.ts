// What the water module (lib/modules.ts) says about a place: ZUK's planned
// water cuts from the ZUK file (lib/zuk-data.ts zukView), those at this
// address only. Pure, so the unit tests read every state.
//
// Matching, from the data alone: a cut applies when its locality is the
// address's locality and it names no street (the whole locality) or this
// street. A village part (a TERYT part with a parent) also gets its
// village's cut when ZUK names the whole village and nothing more: no
// street, scope whole, no note. Not a village's cut "w części", by house
// ranges or numbers, with a note, or on a street: we cannot tell whether
// the part is in it. Notices (posts we could not read safely) are matched
// by the localities the gate found in them, the part's village included.
//
// With a house number, a cut by house ranges or numbers that clearly leaves
// it out is not shown (outsideRange), and the page says one was left out.
// Anything we cannot compare (no number, parity, "w części", an odd bound, a
// village's range where its streets number on their own) is always shown.
import type { PlaceView } from "@/lib/schedule";
import { longDate } from "./date-labels.ts";
import { absoluteDay, warsawToIso } from "./dates.ts";
import type { Disruption, Notice } from "./disruptions.ts";
import type { Alert, Part, SummaryRow } from "./hub.ts";
import { placePath } from "./places.ts";
import type { ZukData } from "./zuk-data.ts";
import { ZUK_PLACES } from "./zuk-places.generated.ts";

/** The gmina's news: where its water posts appear. */
export const GMINA_NEWS = "https://www.gminalubaczow.pl/aktualnosci/";
const gminaNews = {
  href: GMINA_NEWS,
  text: "aktualności gminy Lubaczów",
};

/** The source, short, after an alert. */
const SHORT = "ZUK Mokrzyca";

export type Water = {
  place: PlaceView;
  /** Cuts still to come here, the soonest first, one per day and hours. */
  outages: Disruption[];
  /** A cut here left out for the house number as given (outsideRange). */
  hiddenForNr: boolean;
  /** Water posts we could not read safely that may concern this locality. */
  notices: Notice[];
  /** The last read of the gmina's posts; null without a file. */
  checkedAt: string | null;
  /** Last checked over an hour ago, or no file. */
  stale: boolean;
  /** No file, or an unreadable one. */
  unavailable: boolean;
};

type Address = Pick<PlaceView, "localityId" | "streetId">;

/** Each village part's village (the town's parts among them). */
const PARENT = new Map<string, string>();
for (const l of ZUK_PLACES.localities)
  if (l.parentId) PARENT.set(l.id, l.parentId);

/** Whether a cut applies to the address (see the top of this file). */
export function matches(address: Address, cut: Disruption): boolean {
  if (cut.place.localityId === address.localityId)
    return (
      cut.place.streetId === null || cut.place.streetId === address.streetId
    );
  return (
    cut.place.localityId === PARENT.get(address.localityId) &&
    cut.place.streetId === null &&
    cut.scope.type === "whole" &&
    cut.note === null
  );
}

/** Localities with streets of their own (the town among them). */
const STREETED = new Set(ZUK_PLACES.streets.map((s) => s.localityId));

/**
 * Where the house number falls in the cut's houses: "inside", "outside", or
 * null when we cannot tell. Compared on whole numbers only ("30a" is inside
 * 23–47, "7/22" is 7 and 22, either inside is enough); a village's range
 * where the village has streets, any scope but ranges or numbers, or
 * anything that does not parse: null.
 */
function houseFit(
  cut: Disruption,
  nr: string | null,
): "inside" | "outside" | null {
  if (nr === null) return null;
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
export function outsideRange(cut: Disruption, nr: string | null): boolean {
  return houseFit(cut, nr) === "outside";
}

const wholeLocality = (cut: Disruption) =>
  cut.place.streetId === null && cut.scope.type === "whole";

const slot = (cut: Disruption) => `${cut.date}|${cut.start}|${cut.end}`;

/**
 * The cuts at the address: the soonest first, and where the whole locality
 * is cut, not again for its street on the same day and hours.
 */
function atAddress(address: Address, cuts: Disruption[]): Disruption[] {
  const found = cuts
    .filter((cut) => matches(address, cut))
    .toSorted(
      (a, b) =>
        slot(a).localeCompare(slot(b)) ||
        Number(wholeLocality(b)) - Number(wholeLocality(a)),
    );
  const whole = new Set<string>();
  const uids = new Set<string>();
  return found.filter((cut) => {
    if (uids.has(cut.uid) || whole.has(slot(cut))) return false;
    uids.add(cut.uid);
    if (wholeLocality(cut)) whole.add(slot(cut));
    return true;
  });
}

/** The module's data for a place, from what the pages get of the file. */
export function water(view: ZukData, place: PlaceView): Water {
  const here = atAddress(place, view.disruptions);
  const village = PARENT.get(place.localityId);
  const outages = here.filter((cut) => !outsideRange(cut, place.givenNr));
  return {
    place,
    outages,
    hiddenForNr: outages.length < here.length,
    notices: view.notices.filter((notice) =>
      notice.localityIds.some(
        (id) => id === place.localityId || id === village,
      ),
    ),
    checkedAt: view.checkedAt,
    stale: view.stale,
    unavailable: view.unavailable,
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
function when(cut: Disruption): string {
  const time = hours(cut);
  return `${absoluteDay(cut.date)}${time ? `, ${time}` : ""}`;
}

/**
 * What is cut, in our names, with the source's own words on the houses as
 * written: "cała miejscowość Lisie Jamy", "cała ulica Żuki", "Załuże:
 * Podłęże od numeru 44 do numeru 92".
 */
export function scope(cut: Disruption): string {
  const label = cut.label;
  const street = label?.street ?? null;
  const name = street ? `ulica ${street}` : (label?.locality ?? cut.where);
  if (cut.scope.type === "whole" && !cut.note) {
    return street
      ? `cała ulica ${street}`
      : `cała miejscowość ${label?.locality ?? cut.where}`;
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

/** "1 dzień", "2 dni". */
const days = (n: number) => `${n} ${n === 1 ? "dzień" : "dni"}`;

/**
 * " w części ulicy" or " w części miejscowości" when the cut may leave the
 * address out: not the whole place, and not a house range that clearly
 * includes the number as given; "" when certain.
 */
function part(cut: Disruption, nr: string | null): string {
  if (cut.scope.type === "whole" && !cut.note) return "";
  if (houseFit(cut, nr) === "inside") return "";
  return ` w części ${cut.place.streetId ? "ulicy" : "miejscowości"}`;
}

/** The nearest cut, with how many more days follow; none without a cut. */
export function waterAlerts(data: Water): Alert[] {
  const [next] = data.outages;
  if (!next) return [];
  const more = new Set(
    data.outages.map((cut) => cut.date).filter((date) => date !== next.date),
  ).size;
  return [
    {
      text: `przerwa w dostawie${part(next, data.place.givenNr)} – ${when(next)}${more > 0 ? ` (i jeszcze ${days(more)})` : ""}.`,
      href: waterPath(data.place),
      // One water alert at most, so the name stays unique.
      link: "Więcej o tej przerwie",
      short: SHORT,
      from:
        warsawToIso(next.start ?? `${next.date} 00:00:00`) ??
        `${next.date}T00:00:00`,
    },
  ];
}

/** "Gmina ogłosiła przerwę …": a link to each post we could not read. */
export function noticeLink(notice: Notice): Part {
  return {
    href: notice.source.url,
    text: "Gmina ogłosiła przerwę w dostawie wody, której nie umiemy dopasować do adresów – sprawdź komunikat",
    hidden: `„${notice.title}”`,
  };
}

/** Over an hour since the last check: the gmina's news, to be sure. */
export function staleNote(data: Water): Part[] | null {
  if (!data.stale || data.unavailable) return null;
  return [
    "Od ponad godziny nie udało się nam sprawdzić nowych komunikatów. Zajrzyj też do ",
    gminaNews,
    ".",
  ];
}

/** The card: the nearest cut, any more days, notices; null with nothing. */
export function waterSummary(data: Water): SummaryRow[] | null {
  if (data.outages.length === 0 && data.notices.length === 0) return null;
  const rows: SummaryRow[] = [];
  const [next, ...rest] = data.outages;
  if (next) {
    rows.push(["Najbliższa przerwa", [when(next)]]);
    rows.push(["Gdzie", [scope(next)]]);
    const later = rest.filter((cut) => cut.date !== next.date);
    if (later.length > 0)
      rows.push([
        "Kolejne",
        [[...new Set(later.map((cut) => absoluteDay(cut.date)))].join("; ")],
      ]);
  }
  for (const notice of data.notices)
    rows.push(["Komunikat", [noticeLink(notice)]]);
  const note = staleNote(data);
  if (note) rows.push(["Uwaga", note]);
  return rows;
}

/**
 * The subpage's AI-read note (components/subpage-parts.tsx AiReadNote), as
 * the waste schedule's (lib/schedule-notes.ts UNVERIFIED_NOTE).
 */
export const WATER_AI_NOTE =
  "Te daty i godziny odczytaliśmy automatycznie z komunikatu gminy i nikt ich jeszcze nie sprawdził drugi raz. Gdyby coś się nie zgadzało, rację ma komunikat gminy.";

/** The subpage with no cut here: why, then the gmina's news; else null. */
export function waterEmpty(data: Water): Part[] | null {
  if (data.outages.length > 0) return null;
  return [
    data.unavailable
      ? "Nie udało się nam teraz sprawdzić komunikatów o wodzie. Zajrzyj do "
      : "Nie wiemy o żadnej zapowiedzianej przerwie w dostawie wody pod tym adresem. Gmina ogłasza je w ",
    gminaNews,
    ".",
  ];
}

/** After the cuts or the empty text: a cut here left out for the number. */
export function waterTrace(data: Water): string | null {
  if (!data.hiddenForNr) return null;
  const where =
    data.place.streetId === null ? "w tej miejscowości" : "na tej ulicy";
  return `Gmina zapowiedziała też przerwę ${where}, ale według komunikatu nie obejmuje nr ${data.place.givenNr}.`;
}

/** What „Bez zapowiedzi” says: none announced, or we could not check. */
export function waterNone(data: Water): string {
  if (data.unavailable) return "nie udało się nam sprawdzić komunikatów";
  if (data.stale)
    return "brak zapowiedzianych przerw przy ostatnim sprawdzeniu, ale od ponad godziny nie udało się nam sprawdzić nowych";
  return "brak zapowiedzianych przerw w dostawie";
}

/** The post itself: "Komunikat gminy z 23 października 2026". */
function postLink(item: Pick<Disruption, "source" | "publishedAt">) {
  return {
    href: item.source.url,
    text: `Komunikat gminy z ${longDate(item.publishedAt.slice(0, 10))}`,
  };
}

/**
 * „Źródło”: each post a cut or notice here comes from; without one, the
 * gmina's news. When it was checked: the module's checked line.
 */
export function waterSources(data: Water): Part[][] {
  const posts = new Map<string, Part>();
  for (const item of [...data.outages, ...data.notices])
    if (!posts.has(item.source.url)) posts.set(item.source.url, postLink(item));
  if (posts.size === 0) return [[gminaNews]];
  return [...posts.values()].map((link) => [link]);
}

/** The last read of the gmina's posts; null without a file. */
export function waterChecked(data: Water): Date | null {
  return data.checkedAt ? new Date(data.checkedAt) : null;
}
