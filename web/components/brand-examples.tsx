import {
  LOGO_HEIGHT,
  LOGO_WIDTH,
  PLATE,
  PLATE_WIDTH,
  RIM,
  RIM_WIDTH,
  UL,
  WORDMARK,
} from "@/lib/logo";

// Do/don't examples for /marka: the lockup as drawn, and the four mistakes
// docs/brand.md names. Decorative; the figure caption carries the meaning.
export type Misuse = "stretched" | "recoloured" | "shadow" | "retyped";

export function LogoExample({ id, misuse }: { id: string; misuse?: Misuse }) {
  const stretched = misuse === "stretched";
  return (
    <svg
      aria-hidden="true"
      width="180"
      height={stretched ? 56 : 32}
      viewBox={`0 0 ${LOGO_WIDTH} ${LOGO_HEIGHT}`}
      preserveAspectRatio={stretched ? "none" : undefined}
      style={
        misuse === "shadow"
          ? { filter: "drop-shadow(2px 3px 2px rgb(0 0 0 / 0.7))" }
          : undefined
      }
      className="block"
    >
      <mask
        id={id}
        maskUnits="userSpaceOnUse"
        x="0"
        y="0"
        width={PLATE_WIDTH}
        height={LOGO_HEIGHT}
      >
        <path fill="#fff" d={PLATE} />
        <path fill="none" stroke="#000" strokeWidth={RIM_WIDTH} d={RIM} />
        {misuse === "retyped" ? (
          <text
            x="8"
            y="24"
            fontFamily="Georgia, 'Times New Roman', serif"
            fontSize="19"
            fontStyle="italic"
          >
            ul.
          </text>
        ) : (
          <path d={UL} />
        )}
      </mask>
      <path
        fill={misuse === "recoloured" ? "#3d8bd6" : "var(--accent)"}
        mask={`url(#${id})`}
        d={PLATE}
      />
      <path fill="currentColor" d={WORDMARK} />
    </svg>
  );
}
