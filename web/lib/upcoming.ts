// What each module gives the address page's timeline (lib/timeline.ts,
// components/timeline.tsx): an Item per cut, warning or pickup, with its
// labels made on the server, absolute (dates, clock times); only the
// relative words follow the day (components/day-word.tsx). Pure and
// client-safe.
import type { Bins } from "./hub.ts";

/** When something happens, with its labels made on the server. */
export type Span = {
  /** ISO instants; without a time, its day's 0:00 and the next day's. */
  start: string;
  end: string;
  /** The Warsaw days of start and end. */
  day: string;
  endDay: string;
  /** "8:00"; null when the source gives no time. */
  from: string | null;
  to: string | null;
  /** The end is the source's estimate: „ok. 16:00”. */
  about: boolean;
  /** The end's day after „do”: "soboty 31 października". */
  until: string;
};

/** IMGW's level, as its tag: the colour never the only signal. */
export type Tag = { tag: string; text: string };

type Base = {
  span: Span;
  /** The second sentence (where, or when to put the bins out); or null. */
  second: string | null;
};

/** One entry of the timeline: a module's cut, warning or pickup. */
export type Item = Base &
  (
    | { module: "woda"; emergency: boolean }
    /** `event` lower-case, in running text: "silny wiatr". */
    | { module: "pogoda"; event: string; level: Tag }
    /** "papier, szkło" or "wszystkie pojemniki". */
    | { module: "smieci"; bins: string; pickups: Bins["bins"] }
  );
