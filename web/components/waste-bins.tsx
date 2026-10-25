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
// a client component) and the address page's waste card, a server one: no
// "use client", so the card adds no JS.

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

function WasteMark({ tone, large }: { tone: string; large: boolean }) {
  const token = TOKEN[tone];
  const fill = token ? `var(--waste-${token})` : "var(--app-bin-other)";
  const outline =
    token && OUTLINED.has(token) ? `var(--waste-${token}-border)` : "none";
  const [width, height] = large ? [34, 48] : [28, 40];
  return (
    <svg
      aria-hidden="true"
      width={width}
      height={height}
      viewBox={`0 0 ${BIN_WIDTH} ${BIN_HEIGHT}`}
      className="app-bin"
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
  large,
}: {
  pickups: BinList["bins"];
  large: boolean;
}) {
  return (
    <ul className="govuk-list govuk-!-margin-bottom-0">
      {pickups.map((pickup) => (
        <li key={pickup.id}>
          <span aria-hidden="true">
            {tones(pickup.subtype).map((tone) => (
              <WasteMark key={tone} tone={tone} large={large} />
            ))}
          </span>
          {pickup.label}
        </li>
      ))}
    </ul>
  );
}
