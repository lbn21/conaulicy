import "server-only";
import type { IconName } from "@/components/icon";
import { IMGW_PAGE } from "@/lib/imgw-shown";
import { MAX_AGE_MS } from "@/lib/live-status";
import { imgwCopy, pgeCopy } from "@/lib/live-store";
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
import { SEARCH_ID } from "@/lib/search";
import { MZGKIM_NEWS } from "@/lib/water-sources";
import { warningWhen, weather } from "@/lib/weather-module";
import { getWaterData } from "@/lib/zuk-store";

// The home page's „Teraz w gminie” tiles, in order: one entry each, its
// module (icon and colour), its label, its source (the label's link, and
// the panel's source line) and its aggregate read. Every tile is drawn by
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
  /** Its source: the label's link, and its name in the source line;
   * null: no single page (the waste schedules, one per gmina). */
  source: NowLink | null;
  read(week: Week, now: number): Promise<NowTileData | null>;
};

const pogoda: NowTileDef = {
  id: "pogoda",
  icon: "pogoda",
  label: "Pogoda",
  source: { href: IMGW_PAGE, text: "IMGW" },
  async read(_week, now) {
    const data = weather(await imgwCopy(), now);
    if (!data || data.checkedAt === null) return null;
    const checkedAt = new Date(data.checkedAt);
    const top = topWarning(data.shown?.warnings ?? []);
    if (data.shown?.notice && !top) return null;
    if (!top)
      return {
        value: "Brak ostrzeżeń",
        note: "dla powiatu, teraz",
        empty: true,
        checkedAt,
      };
    return {
      value: top.event,
      note: warningWhen(top, now),
      empty: false,
      featured: true,
      tag: { text: `Ostrzeżenie ${top.level}. stopnia`, level: top.level },
      checkedAt,
    };
  },
};

const woda: NowTileDef = {
  id: "woda",
  icon: "woda",
  label: "Woda",
  source: { href: MZGKIM_NEWS, text: "wodociągi" },
  async read(week, now) {
    const views = Object.values(await getWaterData(new Date(now)));
    if (views.every((v) => v.unavailable)) return null;
    const checked = views
      .map((v) => v.checkedAt)
      .filter((at): at is string => at !== null)
      .sort();
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
      checkedAt: checked[0] ? new Date(checked[0]) : null,
    };
  },
};

const prad: NowTileDef = {
  id: "prad",
  icon: "prad",
  label: "Prąd",
  source: { href: PGE_PAGE, text: "PGE Dystrybucja" },
  async read(week, now) {
    const copy = await pgeCopy();
    if (!copy || typeof copy === "string") return null;
    if (now - copy.checkedAt > MAX_AGE_MS) return null;
    const count = powerWeek(copy.feed, week);
    return {
      value:
        count > 0
          ? counted(count, ["wyłączenie", "wyłączenia", "wyłączeń"])
          : "Brak wyłączeń",
      note: WEEK,
      empty: count === 0,
      checkedAt: new Date(copy.checkedAt),
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
  async read(week) {
    const { count, checkedAt } = await wasteWeek(week.from, week.until);
    return {
      value:
        count > 0
          ? counted(count, ["odbiór", "odbiory", "odbiorów"])
          : "Brak odbiorów",
      note: `${WEEK}, różne dni dla ulic`,
      empty: count === 0,
      action: { href: `#${SEARCH_ID}`, text: "Sprawdź swój termin" },
      checkedAt,
    };
  },
};

export const NOW_TILES: NowTileDef[] = [pogoda, woda, prad, smieci];
