import type { Bins as BinList } from "@/lib/hub";
import {
  BIN,
  BIN_HEIGHT,
  BIN_WIDTH,
  OUTLINED,
  TOKEN,
  tones,
} from "@/lib/waste-bin";

// The bin marks, for the street page's schedule (components/pickup-schedule.tsx,
// a client component) and the address page's waste section, a server one: no
// "use client", so the section adds no JS.

function shade(color: string, percent: number): string {
  return `color-mix(in srgb, ${color} ${percent}%, black)`;
}

function rectOf(r: {
  x: number;
  y: number;
  width: number;
  height: number;
  rx: number;
}) {
  return { x: r.x, y: r.y, width: r.width, height: r.height, rx: r.rx };
}

/**
 * A mark's size: large for the next pickup, medium in the pickup list,
 * small in a row of names (the address page): then half the medium one,
 * 5px from its name (GOV.UK's spacing 1) and each bin 15px from the next
 * (spacing 3), side by side.
 */
type Size = "large" | "medium" | "small";

const SIZE: Record<Size, [number, number]> = {
  large: [34, 48],
  medium: [28, 40],
  small: [14, 20],
};

function WasteMark({ tone, size }: { tone: string; size: Size }) {
  const token = TOKEN[tone];
  const fill = token ? `var(--waste-${token})` : "var(--app-bin-other)";
  const outline =
    token && OUTLINED.has(token) ? `var(--waste-${token}-border)` : "none";
  const [width, height] = SIZE[size];
  return (
    <svg
      aria-hidden="true"
      width={width}
      height={height}
      viewBox={`0 0 ${BIN_WIDTH} ${BIN_HEIGHT}`}
      className={
        size === "small" ? "app-bin govuk-!-margin-right-1" : "app-bin"
      }
      stroke={outline}
      strokeWidth="1.2"
      strokeLinejoin="round"
    >
      <rect {...rectOf(BIN.handle)} fill={shade(fill, BIN.handle.shade)} />
      <path fill={fill} d={BIN.body} />
      <path fill={shade(fill, BIN.rim.shade)} stroke="none" d={BIN.rim.d} />
      <path fill={shade(fill, BIN.lid.shade)} d={BIN.lid.d} />
      <rect {...rectOf(BIN.foot)} fill={shade(fill, BIN.foot.shade)} />
      <circle
        cx={BIN.wheel.cx}
        cy={BIN.wheel.cy}
        r={BIN.wheel.r}
        fill={shade(fill, BIN.wheel.shade)}
      />
      <circle
        cx={BIN.hub.cx}
        cy={BIN.hub.cy}
        r={BIN.hub.r}
        fill={fill}
        stroke="none"
      />
    </svg>
  );
}

/** A day's bins: each one's mark, then its name. */
export function Bins({
  pickups,
  size,
}: {
  pickups: BinList["bins"];
  size: Size;
}) {
  return (
    <ul className="govuk-list govuk-!-margin-bottom-0">
      {pickups.map((pickup) => (
        <li
          key={pickup.id}
          className={
            size === "small"
              ? "govuk-!-display-inline-block govuk-!-margin-right-3"
              : undefined
          }
        >
          <span aria-hidden="true">
            {tones(pickup.subtype).map((tone) => (
              <WasteMark key={tone} tone={tone} size={size} />
            ))}
          </span>
          {pickup.label}
        </li>
      ))}
    </ul>
  );
}
