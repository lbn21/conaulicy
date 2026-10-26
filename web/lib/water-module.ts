// What the water module (lib/modules.ts) says about a place: the planned
// water cuts its sources announce (lib/water-sources.ts: the gmina's posts
// everywhere, MZGKiM's in the town and its parts), those at this address
// only, from each source's file (lib/zuk-data.ts zukView). One logic and
// one set of texts for every address: only its list of sources differs.
// Pure, so the unit tests read every state.
//
// Matching, from the data alone: a cut applies when its locality is the
// address's locality and it names no street (the whole locality) or this
// street. A village part (a TERYT part with a parent) also gets its
// village's cut when the post names the whole village and nothing more: no
// street, scope whole, no note. Not a village's cut "w części", by house
// ranges or numbers, with a note, or on a street: we cannot tell whether
// the part is in it. Notices (posts we could not read safely) are matched
// by the localities the gate found in them, the part's village included; a
// post read but for some places (Notice `where`) is linked only where none
// of its cuts is shown.
//
// With a house number, a cut by house ranges or numbers that clearly leaves
// it out is not shown (outsideRange), and the page says one was left out.
// Anything we cannot compare (no number, parity, "w części", an odd bound, a
// village's range where its streets number on their own) is always shown.
//
// Each source's file is fresh, stale (last read over an hour ago) or
// unavailable (none): the texts say which, naming the sources only when
// not all of an address's sources are in that state.
import type { PlaceView } from "@/lib/schedule";
import { longDate } from "./date-labels.ts";
import { absoluteDay, warsawToIso } from "./dates.ts";
import type { Disruption, Notice } from "./disruptions.ts";
import type { Alert, Part, SummaryRow } from "./hub.ts";
import { placePath } from "./places.ts";
import {
  GMINA,
  sourceOf,
  sourcesAt,
  type WaterSource,
  type WaterSourceId,
} from "./water-sources.ts";
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

export type Water = {
  place: PlaceView;
  /** Cuts still to come here, the soonest first, one per day and hours. */
  outages: Disruption[];
  /** Cuts here left out for the house number as given (outsideRange). */
  hidden: Disruption[];
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
  const outages = here.filter((cut) => !outsideRange(cut, place.givenNr));
  const hidden = here.filter((cut) => outsideRange(cut, place.givenNr));
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
function when(cut: Disruption): string {
  const time = hours(cut);
  return `${absoluteDay(cut.date)}${time ? `, ${time}` : ""}`;
}

/**
 * What is cut, in our names, with the source's own words on the houses as
 * written: "cała miejscowość Wzorowo", "cała ulica Próbna", "Wzorowo:
 * Górki od numeru 44 do numeru 92".
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
      short: sourceOf(next.uid).short,
      from:
        warsawToIso(next.start ?? `${next.date} 00:00:00`) ??
        `${next.date}T00:00:00`,
    },
  ];
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

/** Adjacent strings as one, so the page renders one text node. */
function merged(parts: Part[]): Part[] {
  const out: Part[] = [];
  for (const p of parts) {
    const last = out.at(-1);
    if (typeof p === "string" && typeof last === "string")
      out[out.length - 1] = last + p;
    else out.push(p);
  }
  return out;
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

/** The sources of the cuts shown, in the address's order. */
const cutSources = (data: Water) => {
  const used = new Set(data.outages.map((cut) => sourceOf(cut.uid).id));
  return data.sources
    .map((s) => s.source)
    .filter((source) => used.has(source.id));
};

/** The gmina's AI-read note: the shape of every source's. */
export const WATER_AI_NOTE =
  "Te daty i godziny odczytaliśmy automatycznie z komunikatu gminy i nikt ich jeszcze nie sprawdził drugi raz. Gdyby coś się nie zgadzało, rację ma komunikat gminy.";

/**
 * The subpage's AI-read note (components/subpage-parts.tsx AiReadNote), as
 * the waste schedule's (lib/schedule-notes.ts UNVERIFIED_NOTE): the posts
 * of the cuts shown.
 */
export function waterAiNote(data: Water): string {
  const used = cutSources(data);
  if (used.length > 1)
    return `Te daty i godziny odczytaliśmy automatycznie z komunikatów ${used.map((s) => s.of).join(" i ")} i nikt ich jeszcze nie sprawdził drugi raz. Gdyby coś się nie zgadzało, rację mają komunikaty.`;
  const { of } = used[0] ?? GMINA;
  return `Te daty i godziny odczytaliśmy automatycznie z komunikatu ${of} i nikt ich jeszcze nie sprawdził drugi raz. Gdyby coś się nie zgadzało, rację ma komunikat ${of}.`;
}

/** The calendar block's hint: whose change of hours to fetch it again for. */
export function waterCalendarHint(data: Water): string {
  const used = cutSources(data);
  const who = (used.length > 0 ? used : [GMINA])
    .map((s) => s.inline)
    .join(" lub ");
  return `Plik z przerwami. Jeśli ${who} zmieni godziny, pobierz go jeszcze raz.`;
}

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
    "Nie wiemy o żadnej zapowiedzianej przerwie w dostawie wody pod tym adresem. ",
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
  const where =
    data.place.streetId === null ? "w tej miejscowości" : "na tej ulicy";
  return `${who} ${foretold} też przerwę ${where}, ale według komunikatu nie obejmuje nr ${data.place.givenNr}.`;
}

/** What „Bez zapowiedzi” says: none announced, or we could not check. */
export function waterNone(data: Water): string {
  const none = down(data);
  if (none.length > 0)
    return `nie udało się nam sprawdzić komunikatów${named(data, none)}`;
  const old = late(data);
  if (old.length > 0)
    return `brak zapowiedzianych przerw przy ostatnim sprawdzeniu, ale od ponad godziny nie udało się nam sprawdzić nowych${old.length < data.sources.length ? ` komunikatów${named(data, old)}` : ""}`;
  return "brak zapowiedzianych przerw w dostawie";
}

/** The post itself: "Komunikat gminy z 23 października 2026". */
function postLink(item: Pick<Disruption, "uid" | "source" | "publishedAt">) {
  return {
    href: item.source.url,
    text: `Komunikat ${sourceOf(item.uid).of} z ${longDate(item.publishedAt.slice(0, 10))}`,
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
