import "server-only";
import type { IconName } from "@/components/icon";
import { IMGW_PAGE } from "@/lib/imgw-shown";
import type { LiveReads } from "@/lib/live-reads";
import {
  counted,
  type NowLink,
  type NowTileData,
  powerWeek,
  topWarning,
  type Week,
  waterWeek,
} from "@/lib/now-panel";
import { PGE_PAGE } from "@/lib/power-module";
import { wasteWeek } from "@/lib/schedule";
import { SEARCH_INPUT_ID } from "@/lib/search";
import { MZGKIM_NEWS } from "@/lib/water-sources";
import { warningWhen, weather } from "@/lib/weather-module";

// The home page's „Teraz w gminie” tiles, in order: one entry each, its
// module (icon and colour), its label, its source (named and linked in the
// panel's source line only: a tile is a summary, no way off the site;
// t398), an optional action on the page and its aggregate read, plain
// JSON (cached with the home page, lib/page-cache.ts). Every tile is drawn by
// one NowTile (components/now-panel.tsx), in one wrapping row; a new
// module is one more entry here and its read, no layout or CSS change
// (docs/layout.md, „Teraz w gminie”). A read gives null when its source
// could not be read now: the tile says so, muted.

/** Every count's window; the week's dates are in the panel's subtitle. */
const WEEK = "w tym tygodniu";

export type NowTileDef = {
  id: string;
  /** Its module's icon and colour (.app-mod--<icon>). */
  icon: IconName;
  label: string;
  /** Its source, linked in the panel's source line; null: no single page
   * (the waste schedules, one per gmina). */
  source: NowLink | null;
  /** A link at the tile's foot to a field on the page, which it focuses
   * (FieldLink); shown read or not. */
  action?: NowLink & { href: `#${string}` };
  read(week: Week, reads: LiveReads): Promise<NowTileData | null>;
};

const pogoda: NowTileDef = {
  id: "pogoda",
  icon: "pogoda",
  label: "Pogoda",
  source: { href: IMGW_PAGE, text: "IMGW" },
  async read(_week, { imgw, now }) {
    const data = weather(await imgw(), now);
    if (!data?.read) return null;
    const { changedAt } = data;
    const top = topWarning(data.shown?.warnings ?? []);
    if (data.shown?.notice && !top) return null;
    if (!top)
      return {
        value: "Brak ostrzeżeń",
        note: "dla powiatu, teraz",
        empty: true,
        changedAt,
      };
    return {
      value: top.event,
      note: warningWhen(top, now),
      empty: false,
      featured: true,
      tag: { text: `Ostrzeżenie ${top.level}. stopnia`, level: top.level },
      changedAt,
    };
  },
};

const woda: NowTileDef = {
  id: "woda",
  icon: "woda",
  label: "Woda",
  source: { href: MZGKIM_NEWS, text: "wodociągi" },
  async read(week, { water }) {
    const views = Object.values(await water());
    if (views.every((v) => v.unavailable)) return null;
    const changed = views.flatMap((v) =>
      v.changedAt ? [Date.parse(v.changedAt)] : [],
    );
    const count = views.reduce(
      (n, v) => n + waterWeek(v.disruptions, week, () => v.checkedAt),
      0,
    );
    return {
      value:
        count > 0
          ? counted(count, ["przerwa", "przerwy", "przerw"])
          : "Brak przerw",
      note: WEEK,
      empty: count === 0,
      changedAt: changed.length > 0 ? Math.max(...changed) : null,
    };
  },
};

const prad: NowTileDef = {
  id: "prad",
  icon: "prad",
  label: "Prąd",
  source: { href: PGE_PAGE, text: "PGE Dystrybucja" },
  async read(week, { pge }) {
    const copy = await pge();
    if (!copy || typeof copy === "string") return null;
    const count = powerWeek(copy.feed, week);
    return {
      value:
        count > 0
          ? counted(count, ["wyłączenie", "wyłączenia", "wyłączeń"])
          : "Brak wyłączeń",
      note: WEEK,
      empty: count === 0,
      changedAt: copy.changedAt,
    };
  },
};

// Never one gmina-wide „next pickup”: every sector has its own days. The
// count of pickups this week, and the way to the address's own dates.
const smieci: NowTileDef = {
  id: "smieci",
  icon: "smieci",
  label: "Śmieci",
  source: null,
  action: { href: `#${SEARCH_INPUT_ID}`, text: "Sprawdź swój termin" },
  async read(week) {
    const { count } = await wasteWeek(week.from, week.until);
    return {
      value:
        count > 0
          ? counted(count, ["odbiór", "odbiory", "odbiorów"])
          : "Brak odbiorów",
      note: `${WEEK}, różne dni dla ulic`,
      empty: count === 0,
      changedAt: null,
    };
  },
};

export const NOW_TILES: NowTileDef[] = [pogoda, woda, prad, smieci];
