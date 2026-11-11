import {
  CalendarDays,
  ChevronRight,
  Clock,
  CloudSun,
  Droplet,
  type IconNode,
  MapPin,
  Trash2,
  TriangleAlert,
  Zap,
} from "lucide";
import { createElement } from "react";
import type { ModuleId } from "@/lib/address-routes";

// Lucide's icons (lucide.dev), drawn here on the server from the plain
// SVG data of its framework-free package, `lucide`, imported one by one
// (named ESM exports, sideEffects false: only these ship in the server
// bundle, none to the browser). Not lucide-react: its icons are client
// components ("use client", for its context provider), which would ship
// and hydrate JS for a picture. Always beside text that says the same, so
// always aria-hidden.
// Sized by site.scss (.app-icon: 1.25em, the text's line), coloured by
// currentColor.

const ICONS = {
  smieci: Trash2,
  woda: Droplet,
  prad: Zap,
  pogoda: CloudSun,
  alert: TriangleAlert,
  calendar: CalendarDays,
  chevron: ChevronRight,
  clock: Clock,
  pin: MapPin,
} satisfies Record<ModuleId, IconNode> & Record<string, IconNode>;

export type IconName = keyof typeof ICONS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className="app-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONS[name].map(([tag, attrs], i) =>
        // A fixed list of shapes, never reordered.
        createElement(tag, { key: i, ...attrs }),
      )}
    </svg>
  );
}

/** A module's icon on its colour's tile (site.scss .app-tile, .app-mod--*). */
export function Tile({ name }: { name: IconName }) {
  return (
    <span className="app-tile">
      <Icon name={name} />
    </span>
  );
}
