import {
  LOGO_HEIGHT,
  PLATE,
  PLATE_WIDTH,
  RIM,
  RIM_WIDTH,
  UL,
  UL_TRANSFORM,
} from "@/lib/logo";

/** The "ul." plate's mask: the rim and the "ul." cut out of the plate. */
export function PlateMask({ id }: { id: string }) {
  return (
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
      <path d={UL} transform={UL_TRANSFORM} />
    </mask>
  );
}
